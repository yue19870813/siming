using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Siming;
using Siming.Serialization.Json;

internal static class Program
{
    private static string contracts = "";
    private static int count;
    private static async Task Main(string[] args)
    {
        contracts = Path.GetFullPath(args.Length > 0 ? args[0] : "sdks/csharp/contracts");
        foreach (var layout in new[] { "bundled", "directory-chunks" })
        {
            await Test(layout + ": behavior contract", () => Behavior(layout));
            await Test(layout + ": state and language", () => StateAndLocale(layout));
            await Test(layout + ": variables and invalid actions", () => Variables(layout));
            await Test(layout + ": events, cancellation, reentrancy", () => Events(layout));
            await Test(layout + ": corrupt data", () => Corruption(layout));
            await Test(layout + ": loop and timer", () => LoopAndTimer(layout));
        }
        await Test("chunk cache, pins and cancellation", Cache);
        await Test("failed locale switch is atomic", LocaleFailure);
        await Test("invalid restore leaves position intact", RestoreFailure);
        await Test("filesystem path boundaries", Paths);
        await Test("cancelled locale and expired event contexts", CancellationBoundaries);
        Console.WriteLine($"PASS: {count} test groups");
    }
    private static async Task Test(string name, Func<Task> test) { await test(); count++; Console.WriteLine("PASS " + name); }
    private static void Assert(bool value, string message = "Assertion failed") { if (!value) throw new Exception(message); }
    private static async Task Error(string code, Func<Task> action)
    {
        try { await action(); } catch (SimingException ex) { Assert(ex.Code == code, $"Expected {code}, got {ex.Code}: {ex}"); return; }
        throw new Exception("Expected error " + code);
    }
    private static Task Action(Action action) { action(); return Task.CompletedTask; }
    private static async Task Cancelled(Task task)
    { try { await task; } catch (OperationCanceledException) { return; } throw new Exception("Expected cancellation"); }
    private static Task<SimingProject> Open(MemorySource source) => SimingProject.OpenAsync(new JsonProjectLoader(source));
    private static async Task Behavior(string layout)
    {
        var contract = JObject.Parse(File.ReadAllText(Path.Combine(contracts, "behavior.json")));
        foreach (var scenario in (JArray)contract["scenarios"]!)
        {
            using var project = await Open(new MemorySource(layout)); var handler = new Handler();
            using var session = project.CreateSession(businessEvents: handler, locale: "en-US");
            var nodes = new List<string>(); var messages = new List<string>(); long last = 0;
            session.StateChanged += view => { if (view.VisitSequence != last) { nodes.Add(view.NodeKey!); last = view.VisitSequence; } };
            session.HostEventReceived += e => messages.Add(e.Message.Name);
            await session.StartByKeyAsync("sdk_demo"); Assert(session.Current.SpeakerName == "Narrator");
            Assert(session.Current.Text == "Welcome to Siming.");
            await session.ContinueAsync(); await session.ChooseAsync(scenario["choices"]![0]!.Value<string>()!);
            if (session.Current.AutoDelayMs != null) await session.TickAsync(0.5); else await session.ContinueAsync();
            Assert(session.Current.Status == SessionStatus.Completed);
            Assert(nodes.SequenceEqual(scenario["nodes"]!.Values<string>()), string.Join(",", nodes));
            Assert(messages.SequenceEqual(scenario["hostEvents"]!.Values<string>()));
            Assert(handler.Calls.SequenceEqual(scenario["businessEvents"]!.Values<string>()));
            foreach (var p in ((JObject)scenario["variables"]!).Properties())
                Assert(session.Variables.Get(p.Name).Equals(Value(p.Value)), p.Name);
        }
    }
    private static async Task StateAndLocale(string layout)
    {
        using var project = await Open(new MemorySource(layout));
        var handler = new Handler(); using var session = project.CreateSession(businessEvents: handler);
        int events = 0; session.HostEventReceived += _ => events++;
        await session.StartByKeyAsync("sdk_demo"); var initial = session.CaptureState();
        await session.SetLocaleAsync("en-US"); Assert(session.Current.Text == "Welcome to Siming.");
        Assert(events == 3); Assert(session.Current.VisitSequence == initial.VisitSequence);
        await session.SetLocaleAsync("unsupported"); Assert(session.Current.Locale == "zh-CN");
        await session.ContinueAsync(); var choice = session.CaptureState();
        await session.ChooseAsync("accept"); await session.TickAsync(0.2);
        var auto = session.CaptureState(); Assert(auto.RemainingDelayMs == 300);
        await session.SetLocaleAsync("en-US"); Assert(session.CaptureState().RemainingDelayMs == 300);
        int before = events;
        await session.RestoreStateAsync(auto); Assert(events == before && handler.Calls.Count == 1);
        await session.TickAsync(0.299); Assert(session.Current.Status == SessionStatus.WaitingDialogue);
        await session.TickAsync(0.002); Assert(session.Current.Status == SessionStatus.Completed);
        before = events; await session.RestoreStateAsync(choice); Assert(events == before);
        Assert(session.Current.Choices.Select(c => c.Id).SequenceEqual(new[] { "accept", "reject" }));
        using var other = project.CreateSession(); await other.RestoreStateAsync(initial);
        Assert(other.Current.VisitSequence == initial.VisitSequence && other.Current.Status == SessionStatus.WaitingDialogue);
    }
    private static async Task Variables(string layout)
    {
        using var project = await Open(new MemorySource(layout));
        var memory = new MemoryVariableStore(project.Info.Variables.Values);
        using var first = project.CreateSession(memory); using var second = project.CreateSession();
        first.Variables.Set("score", new VariableValue(3d)); Assert(second.Variables.Get("score").Number == 0);
        await Error("VariableTypeMismatch", () => Action(() => first.Variables.Set("score", new VariableValue("3"))));
        await Error("UnknownVariable", () => Action(() => first.Variables.Set("unknown", new VariableValue(false))));
        await Error("InvalidNumber", () => Action(() => _ = new VariableValue(double.NaN)));
        var snapshot = memory.CaptureValues(); memory.Set("score", new VariableValue(9d)); memory.RestoreValues(snapshot); Assert(memory.Get("score").Number == 3);
        var invalid = snapshot.ToDictionary(p => p.Key, p => p.Value); invalid["score"] = new VariableValue("bad"); invalid["title"] = new VariableValue("changed");
        await Error("VariableTypeMismatch", () => Action(() => memory.RestoreValues(invalid))); Assert(memory.Get("title").String == "hero");
        await Error("InvalidAction", () => first.ContinueAsync());
        await first.StartByKeyAsync("sdk_demo"); await first.ContinueAsync();
        await Error("UnknownChoice", () => first.ChooseAsync("bad")); Assert(first.Current.Status == SessionStatus.WaitingChoice);
        await Error("InvalidAction", () => first.ContinueAsync());
        await Error("ConditionTypeMismatch", () => Action(() => new Condition("==", "score", new VariableValue("3")).Evaluate(first.Variables)));
        await Error("InvalidCondition", () => Action(() => new Condition(">", "title", new VariableValue("a")).Evaluate(first.Variables)));
        foreach (var op in new[] { "==", "!=", ">", ">=", "<", "<=" })
        {
            bool expected = op == "!=" || op == ">" || op == ">=";
            Assert(new Condition(op, "score", new VariableValue(2d)).Evaluate(first.Variables) == expected);
        }
    }
    private static async Task Events(string layout)
    {
        using var project = await Open(new MemorySource(layout));
        var blocker = new Handler { Block = new TaskCompletionSource<bool>() };
        using var session = project.CreateSession(businessEvents: blocker);
        int diagnostics = 0, delivered = 0; session.Diagnostic += _ => diagnostics++;
        session.HostEventReceived += _ => throw new Exception("Listener error");
        session.HostEventReceived += _ => { delivered++; try { session.ContinueAsync(); } catch (SimingException ex) { Assert(ex.Code == "SessionBusy"); } };
        await session.StartByKeyAsync("sdk_demo"); Assert(delivered == 3 && diagnostics == 3);
        await session.ContinueAsync(); var running = session.ChooseAsync("accept");
        Assert(session.Current.Status == SessionStatus.WaitingEvent);
        await Error("SessionBusy", () => session.ContinueAsync());
        await Error("SessionBusy", () => Action(() => session.CaptureState()));
        session.Stop(); await Cancelled(running);
        Assert(session.Current.Status == SessionStatus.Stopped);
        await Cancelled(ActionTask(() => blocker.Context!.Set("score", new VariableValue(100d))));
        blocker.Block.SetResult(true); await Task.Yield(); Assert(session.Current.Status == SessionStatus.Stopped && session.Variables.Get("score").Number == 2);
        using var missing = project.CreateSession(); await missing.StartByKeyAsync("sdk_demo"); await missing.ContinueAsync();
        await Error("MissingEventHandler", () => missing.ChooseAsync("accept")); Assert(missing.Current.Status == SessionStatus.Faulted);
        using var failing = project.CreateSession(businessEvents: new Handler { Fail = true }); await failing.StartByKeyAsync("sdk_demo"); await failing.ContinueAsync();
        await Error("RuntimeFailure", () => failing.ChooseAsync("accept")); Assert(failing.Current.Status == SessionStatus.Faulted);
        using var stopped = project.CreateSession(); stopped.HostEventReceived += _ => stopped.Stop();
        await Cancelled(stopped.StartByKeyAsync("sdk_demo")); Assert(stopped.Current.Status == SessionStatus.Stopped);
    }
    private static async Task ActionTask(Action action) { await Task.CompletedTask; action(); }
    private static async Task Corruption(string layout)
    {
        var badHash = new MemorySource(layout); badHash.Bytes[badHash.StructurePath] = Encoding.UTF8.GetBytes("{}");
        if (layout == "bundled") await Error("IntegrityFailure", async () => { using var _ = await Open(badHash); });
        else { using var p = await Open(badHash); using var s = p.CreateSession(); await Error("IntegrityFailure", () => s.StartByKeyAsync("sdk_demo")); }
        var future = new MemorySource(layout); future.Edit("manifest.json", j => j["runtimeSchemaVersion"] = 2, false);
        await Error("UnsupportedVersion", async () => { using var _ = await Open(future); });
        foreach (var item in new (string Code, Action<JObject> Edit)[] {
            ("MissingNode", j => Nodes(j).Properties().First(p => p.Value["type"]!.Value<string>() == "start").Value["next"] = "00000000-0000-0000-0000-000000000000"),
            ("UnknownNodeType", j => Nodes(j).Properties().First().Value["type"] = "future"),
            ("InvalidCondition", j => Nodes(j).Properties().First(p => p.Value["type"]!.Value<string>() == "condition").Value["condition"] = JObject.Parse("{\"variable\":\"score\",\"operator\":\"==\",\"value\":\"bad\"}")),
            ("DuplicateChoice", j => { var a = (JArray)Nodes(j).Properties().First(p => p.Value["type"]!.Value<string>() == "choice").Value["choices"]!; a.Add(a[0].DeepClone()); }),
            ("MissingText", j => Nodes(j).Properties().First(p => p.Value["type"]!.Value<string>() == "dialogue").Value["textKey"] = "missing") })
        {
            var source = new MemorySource(layout); source.Edit(source.StructurePath, item.Edit);
            using var p = await Open(source); using var s = p.CreateSession(); await Error(item.Code, () => s.StartByKeyAsync("sdk_demo"));
        }
        var path = new MemorySource(layout); path.Edit("manifest.json", j => j["files"]![0]!["path"] = "../escape", false);
        await Error("InvalidPath", async () => { using var _ = await Open(path); });
    }
    private static JObject Nodes(JObject structure) => (JObject)((JObject)structure["dialogues"]!).Properties().First(p => p.Value["key"]!.Value<string>() == "sdk_demo").Value["nodes"]!;
    private static async Task LoopAndTimer(string layout)
    {
        var source = new MemorySource(layout);
        source.Edit(source.StructurePath, j => { var start = Nodes(j).Properties().First(p => p.Value["type"]!.Value<string>() == "start"); start.Value["next"] = start.Name; });
        using var p = await Open(source); using var s = p.CreateSession(); await Error("LoopGuard", () => s.StartByKeyAsync("sdk_demo")); Assert(s.Current.VisitSequence == 1000);
        source = new MemorySource(layout);
        source.Edit(source.StructurePath, j => { var n = Nodes(j).Properties().First(p => p.Value["key"]!.Value<string>() == "welcome"); n.Value["advancePolicy"] = JObject.Parse("{\"mode\":\"auto\",\"delayMs\":0}"); n.Value["next"] = n.Name; });
        using var p2 = await Open(source); using var s2 = p2.CreateSession(); await s2.StartByKeyAsync("sdk_demo"); long visit = s2.Current.VisitSequence;
        await s2.TickAsync(100); Assert(s2.Current.VisitSequence == visit + 1); await s2.TickAsync(0); Assert(s2.Current.VisitSequence == visit + 2);
    }
    private static async Task Cache()
    {
        var source = new MemorySource("directory-chunks"); using var project = await Open(source);
        var id = project.Info.DialogueKeys.First(p => p.Value == "sdk_demo").Key;
        Assert(!source.Reads.ContainsKey(source.StructurePath)); Assert(!source.Reads.ContainsKey("dialogues.runtime.json"));
        var pending = new TaskCompletionSource<bool>(); source.Delays[source.StructurePath] = pending.Task;
        using var cancel = new CancellationTokenSource();
        var first = project.PreloadAsync(id, "en-US", cancel.Token); var second = project.PreloadAsync(id, "en-US");
        cancel.Cancel(); await Cancelled(first); pending.SetResult(true); await second;
        Assert(source.Reads[source.StructurePath] == 1);
        using var active = project.CreateSession(locale: "en-US"); await active.StartAsync(id);
        project.ClearUnusedChunks(); await project.PreloadAsync(id, "en-US"); Assert(source.Reads[source.StructurePath] == 1);
        active.Stop(); project.ClearUnusedChunks(); await project.PreloadAsync(id, "en-US"); Assert(source.Reads[source.StructurePath] == 2);
        Assert(!source.Reads.ContainsKey("dialogues.runtime.json"));
    }
    private static async Task LocaleFailure()
    {
        var source = new MemorySource("directory-chunks"); using var project = await Open(source); using var s = project.CreateSession();
        await s.StartByKeyAsync("sdk_demo"); var before = s.Current; int events = 0; s.HostEventReceived += _ => events++;
        var path = "locales/en-US/dialogues/Chapter1/runtime.json"; var original = source.Bytes[path]; source.Bytes[path] = Encoding.UTF8.GetBytes("{}");
        await Error("IntegrityFailure", () => s.SetLocaleAsync("en-US")); Assert(s.Current == before && events == 0);
        source.Bytes[path] = original; await s.SetLocaleAsync("en-US"); Assert(s.Current.Locale == "en-US");
    }
    private static async Task RestoreFailure()
    {
        using var project = await Open(new MemorySource("bundled")); using var s = project.CreateSession(); await s.StartByKeyAsync("sdk_demo"); var state = s.CaptureState(); var before = s.Current;
        await Error("InvalidPlaybackState", () => s.RestoreStateAsync(new PlaybackState(1, "wrong", state.DialogueId, state.NodeId, state.Locale, 1, 0)));
        await Error("InvalidPlaybackState", () => s.RestoreStateAsync(new PlaybackState(1, state.ContentFingerprint, state.DialogueId, "00000000-0000-0000-0000-000000000000", state.Locale, 1, 0)));
        Assert(s.Current == before);
    }
    private static async Task CancellationBoundaries()
    {
        var source = new MemorySource("directory-chunks"); using var project = await Open(source);
        var handler = new Handler(); using var session = project.CreateSession(businessEvents: handler);
        await session.StartByKeyAsync("sdk_demo"); var before = session.Current;
        var wait = new TaskCompletionSource<bool>(); source.Delays["locales/en-US/global.json"] = wait.Task;
        using var cancellation = new CancellationTokenSource();
        var switching = session.SetLocaleAsync("en-US", cancellation.Token); cancellation.Cancel(); await Cancelled(switching);
        Assert(session.Current == before); wait.SetResult(true);
        await session.SetLocaleAsync("en-US"); await session.ContinueAsync(); await session.ChooseAsync("accept");
        await Error("ExpiredEventContext", () => Action(() => handler.Context!.Set("score", new VariableValue(20d))));
        Assert(session.Variables.Get("score").Number == 2);
        var shared = new MemoryVariableStore(project.Info.Variables.Values);
        using var first = project.CreateSession(shared); using var second = project.CreateSession(shared);
        first.Variables.Set("title", new VariableValue("shared")); Assert(second.Variables.Get("title").String == "shared");
    }
    private static async Task Paths()
    {
        foreach (var path in new[] { "../a", "/a", "a/../b", "a\\b", "https://a", "%2e%2e/a", "a//b", "a?x" })
            await Error("InvalidPath", () => Action(() => RuntimePath.Validate(path)));
        var source = new DirectoryDataSource(Path.Combine(contracts, "bundled"));
        using var project = await SimingProject.OpenAsync(new JsonProjectLoader(source)); using var s = project.CreateSession(); await s.StartByKeyAsync("sdk_demo"); Assert(s.Current.Text != null);
    }
    private static VariableValue Value(JToken value) => value.Type switch { JTokenType.Boolean => new VariableValue(value.Value<bool>()), JTokenType.String => new VariableValue(value.Value<string>()!), _ => new VariableValue(value.Value<double>()) };
    private sealed class Handler : IBusinessEventHandler
    {
        public List<string> Calls { get; } = new List<string>();
        public TaskCompletionSource<bool>? Block;
        public bool Fail;
        public BusinessEventContext? Context;
        public Task ExecuteAsync(string name, DataValue parameters, BusinessEventContext context, CancellationToken token)
        { Calls.Add(name); Context = context; if (Fail) throw new Exception("Host failure"); return Block?.Task ?? Task.CompletedTask; }
    }
    private sealed class MemorySource : IRuntimeDataSource
    {
        public Dictionary<string, byte[]> Bytes { get; } = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        public Dictionary<string, int> Reads { get; } = new Dictionary<string, int>(StringComparer.Ordinal);
        public Dictionary<string, Task> Delays { get; } = new Dictionary<string, Task>(StringComparer.Ordinal);
        public string StructurePath { get; }
        public MemorySource(string layout)
        {
            var directory = Path.Combine(contracts, layout);
            foreach (var path in Directory.GetFiles(directory, "*", SearchOption.AllDirectories)) Bytes.Add(Path.GetRelativePath(directory, path).Replace('\\', '/'), File.ReadAllBytes(path));
            StructurePath = layout == "bundled" ? "dialogues.runtime.json" : "dialogues/Chapter1/runtime.json";
        }
        public async Task<byte[]> ReadAsync(string path, CancellationToken token)
        { Reads[path] = Reads.TryGetValue(path, out var count) ? count + 1 : 1; if (Delays.TryGetValue(path, out var delay)) await delay; return Bytes[path]; }
        public void Edit(string path, Action<JObject> edit, bool rehash = true)
        {
            var json = JObject.Parse(Encoding.UTF8.GetString(Bytes[path])); edit(json); Bytes[path] = Encoding.UTF8.GetBytes(json.ToString());
            if (rehash) Edit("manifest.json", manifest => { var f = manifest["files"]!.First(x => x["path"]!.Value<string>() == path); f["bytes"] = Bytes[path].Length; f["sha256"] = Convert.ToHexString(SHA256.HashData(Bytes[path])).ToLowerInvariant(); }, false);
        }
    }
}
