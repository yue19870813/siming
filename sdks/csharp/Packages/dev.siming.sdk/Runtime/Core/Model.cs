#nullable enable
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Threading;
using System.Threading.Tasks;

namespace Siming
{
    public static class Immutable
    {
        public static IReadOnlyDictionary<string, T> Map<T>(IEnumerable<KeyValuePair<string, T>> values)
        {
            var copy = new Dictionary<string, T>(StringComparer.Ordinal);
            foreach (var item in values) copy.Add(item.Key, item.Value);
            return new ReadOnlyDictionary<string, T>(copy);
        }
        public static IReadOnlyList<T> List<T>(IEnumerable<T> values) => new List<T>(values).AsReadOnly();
    }

    public sealed class Condition
    {
        public string Operator { get; }
        public string? Variable { get; }
        public VariableValue Value { get; }
        public IReadOnlyList<Condition> Children { get; }
        public Condition(string op, string variable, VariableValue value) { Operator = op; Variable = variable; Value = value; Children = Array.Empty<Condition>(); }
        public Condition(string op, IEnumerable<Condition> children) { Operator = op; Children = Immutable.List(children); }
        public bool Evaluate(IVariableStore variables)
        {
            if (Operator == "all") { foreach (var c in Children) if (!c.Evaluate(variables)) return false; return true; }
            if (Operator == "any") { foreach (var c in Children) if (c.Evaluate(variables)) return true; return false; }
            if (Operator == "not") return !Children[0].Evaluate(variables);
            var actual = variables.Get(Variable!);
            if (actual.Type != Value.Type) throw new SimingException("ConditionTypeMismatch", Variable!);
            if (Operator == "==") return actual.Equals(Value);
            if (Operator == "!=") return !actual.Equals(Value);
            if (actual.Type != VariableType.Number) throw new SimingException("InvalidCondition", "Only numbers support ordering.");
            return Operator switch { ">" => actual.Number > Value.Number, ">=" => actual.Number >= Value.Number,
                "<" => actual.Number < Value.Number, "<=" => actual.Number <= Value.Number,
                _ => throw new SimingException("InvalidCondition", Operator) };
        }
    }

    public enum NodeType { Start, Dialogue, Choice, Condition, Event, End }
    public sealed class HostMessage
    {
        public string Name { get; }
        public DataValue Payload { get; }
        public HostMessage(string name, DataValue payload) { Name = name; Payload = payload; }
    }
    public sealed class Choice
    {
        public string Id { get; }
        public string TextKey { get; }
        public string Next { get; }
        public Choice(string id, string textKey, string next) { Id = id; TextKey = textKey; Next = next; }
    }
    public sealed class RuntimeNode
    {
        public string Key { get; }
        public NodeType Type { get; }
        public string? Next { get; }
        public string? SpeakerId { get; }
        public string? TextKey { get; }
        public double? AutoDelayMs { get; }
        public IReadOnlyList<HostMessage> HostEvents { get; }
        public IReadOnlyList<Choice> Choices { get; }
        public Condition? Condition { get; }
        public string? TrueTarget { get; }
        public string? FalseTarget { get; }
        public string? Event { get; }
        public DataValue Parameters { get; }
        public RuntimeNode(string key, NodeType type, IEnumerable<HostMessage> hostEvents, string? next = null,
            string? speakerId = null, string? textKey = null, double? autoDelayMs = null, IEnumerable<Choice>? choices = null,
            Condition? condition = null, string? trueTarget = null, string? falseTarget = null, string? businessEvent = null, DataValue? parameters = null)
        {
            Key = key; Type = type; HostEvents = Immutable.List(hostEvents); Next = next; SpeakerId = speakerId; TextKey = textKey;
            AutoDelayMs = autoDelayMs; Choices = Immutable.List(choices ?? Array.Empty<Choice>()); Condition = condition;
            TrueTarget = trueTarget; FalseTarget = falseTarget; Event = businessEvent;
            Parameters = parameters ?? DataValue.From(new Dictionary<string, DataValue>());
        }
    }
    public sealed class RuntimeDialogue
    {
        public string Id { get; }
        public string Key { get; }
        public string EntryNodeId { get; }
        public IReadOnlyDictionary<string, RuntimeNode> Nodes { get; }
        public RuntimeDialogue(string id, string key, string entryNodeId, IDictionary<string, RuntimeNode> nodes)
        { Id = id; Key = key; EntryNodeId = entryNodeId; Nodes = Immutable.Map(nodes); }
    }
    public sealed class ProjectInfo
    {
        public string Fingerprint { get; }
        public string DefaultLocale { get; }
        public IReadOnlyList<string> Locales { get; }
        public IReadOnlyDictionary<string, string> DialogueKeys { get; }
        public IReadOnlyDictionary<string, string> CharacterNameKeys { get; }
        public IReadOnlyDictionary<string, VariableDefinition> Variables { get; }
        public ProjectInfo(string fingerprint, string defaultLocale, IEnumerable<string> locales,
            IDictionary<string, string> dialogueKeys, IDictionary<string, string> characterNameKeys, IDictionary<string, VariableDefinition> variables)
        { Fingerprint = fingerprint; DefaultLocale = defaultLocale; Locales = Immutable.List(locales); DialogueKeys = Immutable.Map(dialogueKeys); CharacterNameKeys = Immutable.Map(characterNameKeys); Variables = Immutable.Map(variables); }
    }
    public sealed class LoadedDialogue : IDisposable
    {
        public RuntimeDialogue Dialogue { get; }
        public IReadOnlyDictionary<string, string> Texts { get; }
        public string Locale { get; }
        private Action? release;
        public LoadedDialogue(RuntimeDialogue dialogue, IDictionary<string, string> texts, string locale, Action release)
        { Dialogue = dialogue; Texts = Immutable.Map(texts); Locale = locale; this.release = release; }
        public void Dispose() => Interlocked.Exchange(ref release, null)?.Invoke();
    }
    public interface IRuntimeDataSource { Task<byte[]> ReadAsync(string path, CancellationToken cancellationToken); }
    public interface IRuntimeProjectLoader : IDisposable
    {
        Task<ProjectInfo> OpenAsync(CancellationToken cancellationToken);
        Task<LoadedDialogue> LoadAsync(string dialogueId, string locale, CancellationToken cancellationToken);
        void ClearUnusedChunks();
    }
    public sealed class SimingProject : IDisposable
    {
        private readonly IRuntimeProjectLoader loader;
        private readonly HashSet<DialogueSession> sessions = new HashSet<DialogueSession>();
        private bool disposed;
        public ProjectInfo Info { get; }
        private SimingProject(IRuntimeProjectLoader loader, ProjectInfo info) { this.loader = loader; Info = info; }
        public static async Task<SimingProject> OpenAsync(IRuntimeProjectLoader loader, CancellationToken cancellationToken = default)
        {
            try { return new SimingProject(loader, await loader.OpenAsync(cancellationToken)); }
            catch { loader.Dispose(); throw; }
        }
        public DialogueSession CreateSession(IVariableStore? variables = null, IBusinessEventHandler? businessEvents = null, string? locale = null)
        {
            Check();
            var session = new DialogueSession(this, variables ?? new MemoryVariableStore(Info.Variables.Values), businessEvents, ResolveLocale(locale));
            sessions.Add(session); return session;
        }
        internal string ResolveLocale(string? locale)
        { foreach (var supported in Info.Locales) if (supported == locale) return supported; return Info.DefaultLocale; }
        internal Task<LoadedDialogue> LoadAsync(string id, string locale, CancellationToken token) { Check(); return loader.LoadAsync(id, locale, token); }
        internal void Remove(DialogueSession session) => sessions.Remove(session);
        public async Task PreloadAsync(string dialogueId, string? locale = null, CancellationToken cancellationToken = default)
        { using var data = await LoadAsync(dialogueId, ResolveLocale(locale), cancellationToken); }
        public void ClearUnusedChunks() { Check(); loader.ClearUnusedChunks(); }
        private void Check() { if (disposed) throw new ObjectDisposedException(nameof(SimingProject)); }
        public void Dispose()
        { if (disposed) return; disposed = true; foreach (var session in new List<DialogueSession>(sessions)) session.Dispose(); loader.Dispose(); }
    }
}
