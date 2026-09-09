#nullable enable
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Siming
{
    public enum SessionStatus { NotStarted, Running, WaitingDialogue, WaitingChoice, WaitingEvent, Completed, Stopped, Faulted }
    public sealed class DisplayChoice
    {
        public string Id { get; }
        public string Text { get; }
        public DisplayChoice(string id, string text) { Id = id; Text = text; }
    }
    public sealed class SessionSnapshot
    {
        public SessionStatus Status { get; }
        public string? DialogueId { get; }
        public string? NodeId { get; }
        public string? NodeKey { get; }
        public long VisitSequence { get; }
        public string Locale { get; }
        public string? SpeakerId { get; }
        public string? SpeakerName { get; }
        public string? Text { get; }
        public IReadOnlyList<DisplayChoice> Choices { get; }
        public double? AutoDelayMs { get; }
        public double RemainingDelayMs { get; }
        public SimingException? Error { get; }
        internal SessionSnapshot(SessionStatus status, string? dialogueId, string? nodeId, RuntimeNode? node, long visit,
            string locale, string? speaker, string? text, IEnumerable<DisplayChoice> choices, double remaining, SimingException? error)
        { Status = status; DialogueId = dialogueId; NodeId = nodeId; NodeKey = node?.Key; VisitSequence = visit; Locale = locale;
            SpeakerId = node?.SpeakerId; SpeakerName = speaker; Text = text; Choices = Immutable.List(choices);
            AutoDelayMs = node?.AutoDelayMs; RemainingDelayMs = remaining; Error = error; }
    }
    public sealed class PlaybackState
    {
        public int Version { get; }
        public string ContentFingerprint { get; }
        public string DialogueId { get; }
        public string NodeId { get; }
        public string Locale { get; }
        public long VisitSequence { get; }
        public double RemainingDelayMs { get; }
        public PlaybackState(int version, string contentFingerprint, string dialogueId, string nodeId, string locale, long visitSequence, double remainingDelayMs)
        { Version = version; ContentFingerprint = contentFingerprint; DialogueId = dialogueId; NodeId = nodeId; Locale = locale; VisitSequence = visitSequence; RemainingDelayMs = remainingDelayMs; }
    }
    public sealed class HostEventNotification
    {
        public HostMessage Message { get; }
        public string DialogueId { get; }
        public string NodeId { get; }
        public string NodeKey { get; }
        public long VisitSequence { get; }
        public int MessageIndex { get; }
        internal HostEventNotification(HostMessage message, string dialogueId, string nodeId, string nodeKey, long visit, int index)
        { Message = message; DialogueId = dialogueId; NodeId = nodeId; NodeKey = nodeKey; VisitSequence = visit; MessageIndex = index; }
    }
    public interface IBusinessEventHandler
    { Task ExecuteAsync(string eventName, DataValue parameters, BusinessEventContext context, CancellationToken cancellationToken); }
    public sealed class BusinessEventContext : IVariableStore
    {
        private readonly IVariableStore variables;
        private readonly CancellationToken token;
        private bool active = true;
        public string DialogueId { get; }
        public string NodeId { get; }
        public long VisitSequence { get; }
        internal BusinessEventContext(IVariableStore variables, CancellationToken token, string dialogueId, string nodeId, long visit)
        { this.variables = variables; this.token = token; DialogueId = dialogueId; NodeId = nodeId; VisitSequence = visit; }
        internal void Revoke() => active = false;
        private void Check() { token.ThrowIfCancellationRequested(); if (!active) throw new SimingException("ExpiredEventContext", "Event context is no longer active."); }
        public VariableValue Get(string key) { Check(); return variables.Get(key); }
        public void Set(string key, VariableValue value) { Check(); variables.Set(key, value); }
    }
    public static class AsyncOperation
    {
        // Shared I/O and uncooperative host tasks must not prevent the caller from cancelling.
        public static async Task<T> WaitAsync<T>(Task<T> task, CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var cancelled = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            using var registration = token.Register(() => cancelled.TrySetResult(true));
            if (await Task.WhenAny(task, cancelled.Task) != task)
            {
                _ = task.ContinueWith(t => { _ = t.Exception; }, CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
                throw new OperationCanceledException(token);
            }
            token.ThrowIfCancellationRequested(); return await task;
        }
        public static async Task WaitAsync(Task task, CancellationToken token)
        { await WaitAsync(AsResult(task), token); }
        private static async Task<bool> AsResult(Task task) { await task; return true; }
    }
    public sealed class DialogueSession : IDisposable
    {
        private readonly SimingProject project;
        private readonly IBusinessEventHandler? handler;
        private LoadedDialogue? loaded;
        private CancellationTokenSource? operation;
        private BusinessEventContext? eventContext;
        private int busy;
        private int notifying;
        private bool disposed;
        private string locale;
        private string? nodeId;
        private long visit;
        private double remaining;
        private SessionStatus status;
        private SimingException? error;
        public IVariableStore Variables { get; }
        public SessionSnapshot Current { get; private set; }
        public bool IsBusy => busy != 0 || notifying != 0;
        public event Action<SessionSnapshot>? StateChanged;
        public event Action<HostEventNotification>? HostEventReceived;
        public event Action<SimingException>? Diagnostic;
        internal DialogueSession(SimingProject project, IVariableStore variables, IBusinessEventHandler? handler, string locale)
        {
            this.project = project; this.handler = handler; this.locale = locale;
            Variables = new ValidatedVariableStore(variables, project.Info.Variables);
            Current = Snapshot();
        }
        private RuntimeNode? Node => loaded != null && nodeId != null ? loaded.Dialogue.Nodes[nodeId] : null;
        private bool Waiting => status == SessionStatus.WaitingDialogue || status == SessionStatus.WaitingChoice;
        private void Require(bool condition) { if (!condition) throw new SimingException("InvalidAction", "Action is not valid in the current state."); }
        private void CheckIdle() { if (disposed) throw new ObjectDisposedException(nameof(DialogueSession)); if (IsBusy) throw new SimingException("SessionBusy", "Concurrent or reentrant session actions are not allowed."); }
        private async Task Run(Func<CancellationToken, Task> action, CancellationToken token, bool faultOnError = true)
        {
            CheckIdle();
            if (Interlocked.CompareExchange(ref busy, 1, 0) != 0) throw new SimingException("SessionBusy", "Session is busy.");
            var source = CancellationTokenSource.CreateLinkedTokenSource(token); operation = source;
            try { source.Token.ThrowIfCancellationRequested(); await action(source.Token); }
            catch (OperationCanceledException) when (source.IsCancellationRequested)
            { if (faultOnError && status != SessionStatus.Stopped) Stop(); throw; }
            catch (Exception ex)
            {
                var known = ex as SimingException;
                var failure = new SimingException(known?.Code ?? "RuntimeFailure", ex.Message, ex, known?.DialogueId ?? loaded?.Dialogue.Id, known?.NodeId ?? nodeId);
                if (status == SessionStatus.Stopped) throw new OperationCanceledException(source.Token);
                if (faultOnError) { status = SessionStatus.Faulted; error = failure; Publish(); }
                Report(failure); throw failure;
            }
            finally { eventContext?.Revoke(); eventContext = null; operation = null; source.Dispose(); Volatile.Write(ref busy, 0); }
        }
        public Task StartByKeyAsync(string key, CancellationToken cancellationToken = default)
        {
            foreach (var item in project.Info.DialogueKeys) if (item.Value == key) return StartAsync(item.Key, cancellationToken);
            throw new SimingException("UnknownDialogue", key);
        }
        public Task StartAsync(string dialogueId, CancellationToken cancellationToken = default)
        {
            CheckIdle(); Require(status == SessionStatus.NotStarted || status == SessionStatus.Completed || status == SessionStatus.Stopped || status == SessionStatus.Faulted);
            return Run(async token =>
            {
                var data = await project.LoadAsync(dialogueId, locale, token);
                if (token.IsCancellationRequested) { data.Dispose(); token.ThrowIfCancellationRequested(); }
                loaded?.Dispose(); loaded = data; nodeId = data.Dialogue.EntryNodeId; visit = 0; remaining = 0; error = null;
                await Pump(token);
            }, cancellationToken);
        }
        public Task ContinueAsync(CancellationToken cancellationToken = default)
        {
            CheckIdle(); Require(status == SessionStatus.WaitingDialogue);
            return Run(async token => { nodeId = Node!.Next; await Pump(token); }, cancellationToken);
        }
        public Task ChooseAsync(string choiceId, CancellationToken cancellationToken = default)
        {
            CheckIdle(); Require(status == SessionStatus.WaitingChoice);
            Choice? selected = null; foreach (var choice in Node!.Choices) if (choice.Id == choiceId) selected = choice;
            if (selected == null) throw new SimingException("UnknownChoice", choiceId);
            var target = selected.Next;
            return Run(async token => { nodeId = target; await Pump(token); }, cancellationToken);
        }
        public Task TickAsync(double deltaSeconds, CancellationToken cancellationToken = default)
        {
            CheckIdle();
            if (double.IsNaN(deltaSeconds) || double.IsInfinity(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > double.MaxValue / 1000)
                throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
            if (status != SessionStatus.WaitingDialogue || Node!.AutoDelayMs == null) return Task.CompletedTask;
            return Run(async token =>
            {
                remaining = Math.Max(0, remaining - deltaSeconds * 1000);
                if (remaining == 0) { nodeId = Node!.Next; await Pump(token); } else Current = Snapshot();
            }, cancellationToken);
        }
        public Task SetLocaleAsync(string requestedLocale, CancellationToken cancellationToken = default)
        {
            CheckIdle(); Require(Waiting);
            return Run(async token =>
            {
                var next = await project.LoadAsync(loaded!.Dialogue.Id, project.ResolveLocale(requestedLocale), token);
                if (token.IsCancellationRequested) { next.Dispose(); token.ThrowIfCancellationRequested(); }
                var previous = loaded; loaded = next; locale = next.Locale; previous.Dispose(); Publish();
            }, cancellationToken, false);
        }
        public PlaybackState CaptureState()
        {
            CheckIdle(); Require(Waiting);
            return new PlaybackState(1, project.Info.Fingerprint, loaded!.Dialogue.Id, nodeId!, locale, visit, remaining);
        }
        public Task RestoreStateAsync(PlaybackState state, CancellationToken cancellationToken = default)
        {
            CheckIdle(); Require(status != SessionStatus.Running && status != SessionStatus.WaitingEvent);
            if (state.Version != 1 || state.ContentFingerprint != project.Info.Fingerprint || state.VisitSequence < 1 ||
                state.VisitSequence == long.MaxValue || double.IsNaN(state.RemainingDelayMs) || double.IsInfinity(state.RemainingDelayMs) || state.RemainingDelayMs < 0 ||
                project.ResolveLocale(state.Locale) != state.Locale)
                throw new SimingException("InvalidPlaybackState", "Incompatible content, locale or state version.");
            return Run(async token =>
            {
                var next = await project.LoadAsync(state.DialogueId, state.Locale, token);
                try
                {
                    token.ThrowIfCancellationRequested();
                    if (!next.Dialogue.Nodes.TryGetValue(state.NodeId, out var node) || (node.Type != NodeType.Dialogue && node.Type != NodeType.Choice) ||
                        state.RemainingDelayMs > (node.AutoDelayMs ?? 0))
                        throw new SimingException("InvalidPlaybackState", "State is not a valid waiting point.");
                    loaded?.Dispose(); loaded = next; next = null!;
                    nodeId = state.NodeId; locale = state.Locale; visit = state.VisitSequence; remaining = state.RemainingDelayMs; error = null;
                    status = node.Type == NodeType.Dialogue ? SessionStatus.WaitingDialogue : SessionStatus.WaitingChoice; Publish();
                }
                finally { next?.Dispose(); }
            }, cancellationToken, false);
        }
        private async Task Pump(CancellationToken token)
        {
            status = SessionStatus.Running;
            for (int steps = 0; steps < 1000; steps++)
            {
                token.ThrowIfCancellationRequested();
                var node = Node ?? throw new SimingException("MissingNode", nodeId ?? "null");
                visit = checked(visit + 1); remaining = 0; Publish();
                for (int i = 0; i < node.HostEvents.Count; i++)
                {
                    token.ThrowIfCancellationRequested();
                    Notify(HostEventReceived, new HostEventNotification(node.HostEvents[i], loaded!.Dialogue.Id, nodeId!, node.Key, visit, i));
                }
                token.ThrowIfCancellationRequested();
                switch (node.Type)
                {
                    case NodeType.Start: nodeId = node.Next; break;
                    case NodeType.Dialogue: remaining = node.AutoDelayMs ?? 0; status = SessionStatus.WaitingDialogue; Publish(); return;
                    case NodeType.Choice: status = SessionStatus.WaitingChoice; Publish(); return;
                    case NodeType.Condition: nodeId = node.Condition!.Evaluate(Variables) ? node.TrueTarget : node.FalseTarget; break;
                    case NodeType.Event:
                        status = SessionStatus.WaitingEvent; Publish(); token.ThrowIfCancellationRequested();
                        if (node.Event == "variable.set" || node.Event == "variable.add")
                        {
                            var key = node.Parameters.Fields["key"].Scalar.String; var value = node.Parameters.Fields["value"].Scalar;
                            Variables.Set(key, node.Event == "variable.set" ? value : new VariableValue(Variables.Get(key).Number + value.Number));
                        }
                        else
                        {
                            if (handler == null) throw new SimingException("MissingEventHandler", node.Event!);
                            eventContext = new BusinessEventContext(Variables, token, loaded!.Dialogue.Id, nodeId!, visit);
                            try { await AsyncOperation.WaitAsync(handler.ExecuteAsync(node.Event!, node.Parameters, eventContext, token), token); }
                            finally { eventContext.Revoke(); eventContext = null; }
                        }
                        token.ThrowIfCancellationRequested(); status = SessionStatus.Running; nodeId = node.Next; break;
                    case NodeType.End: status = SessionStatus.Completed; Publish(); Release(); return;
                }
            }
            throw new SimingException("LoopGuard", "Exceeded 1000 consecutive nodes without player interaction.", null, loaded?.Dialogue.Id, nodeId);
        }
        private SessionSnapshot Snapshot()
        {
            var node = Node; string? speaker = null, text = null; var choices = new List<DisplayChoice>();
            // Loaded data has already been validated; building a view has no I/O or side effects.
            if (node != null && loaded != null)
            {
                if (node.SpeakerId != null) speaker = loaded.Texts[project.Info.CharacterNameKeys[node.SpeakerId]];
                if (node.TextKey != null) text = loaded.Texts[node.TextKey];
                foreach (var c in node.Choices) choices.Add(new DisplayChoice(c.Id, loaded.Texts[c.TextKey]));
            }
            return new SessionSnapshot(status, loaded?.Dialogue.Id, nodeId, node, visit, locale, speaker, text, choices, remaining, error);
        }
        private void Publish() { Current = Snapshot(); Notify(StateChanged, Current); }
        private void Notify<T>(Action<T>? callbacks, T value)
        {
            if (callbacks == null) return;
            notifying++;
            try { foreach (Action<T> callback in callbacks.GetInvocationList()) { try { callback(value); } catch (Exception ex) { Report(new SimingException("ListenerFailure", ex.Message, ex)); } } }
            finally { notifying--; }
        }
        private void Report(SimingException failure)
        {
            if (Diagnostic == null) return;
            notifying++;
            try { foreach (Action<SimingException> callback in Diagnostic.GetInvocationList()) { try { callback(failure); } catch { /* Diagnostics cannot interrupt playback. */ } } }
            finally { notifying--; }
        }
        private void Release() { loaded?.Dispose(); loaded = null; }
        public void Stop()
        {
            if (disposed || status == SessionStatus.Stopped) return;
            eventContext?.Revoke(); status = SessionStatus.Stopped;
            try { operation?.Cancel(); } catch (Exception ex) { Report(new SimingException("CancellationFailure", ex.Message, ex)); }
            Publish(); Release();
        }
        public void Dispose() { if (disposed) return; Stop(); disposed = true; project.Remove(this); }
    }
}
