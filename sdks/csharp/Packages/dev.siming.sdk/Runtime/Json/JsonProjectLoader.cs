#nullable enable
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Siming.Serialization.Json
{
    public static class RuntimePath
    {
        public static string Validate(string path)
        {
            if (string.IsNullOrEmpty(path) || path[0] == '/' || path.Contains("\\") || path.Contains(":") || path.Contains("%") || path.Contains("?") || path.Contains("#") || path.Any(char.IsControl) ||
                path.Split('/').Any(p => p.Length == 0 || p == "." || p == ".."))
                throw new SimingException("InvalidPath", path);
            return path;
        }
    }
    public sealed class DirectoryDataSource : IRuntimeDataSource
    {
        private readonly string root;
        public DirectoryDataSource(string root) { this.root = Path.GetFullPath(root); }
        public async Task<byte[]> ReadAsync(string path, CancellationToken cancellationToken)
        {
            RuntimePath.Validate(path);
            // Reject symbolic links anywhere below the trusted root, including the leaf.
            var full = root;
            foreach (var part in path.Split('/'))
            {
                full = Path.Combine(full, part);
                if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) throw new SimingException("InvalidPath", "Symbolic links are not allowed: " + path);
            }
            using var stream = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, true);
            using var output = new MemoryStream();
            await stream.CopyToAsync(output, 81920, cancellationToken); return output.ToArray();
        }
    }
    public sealed class JsonProjectLoader : IRuntimeProjectLoader
    {
        private sealed class FileRecord
        {
            public string Hash = "";
            public long Bytes;
        }
        private sealed class CachedFile
        {
            public Task<JObject> Task = null!;
            public int References;
        }
        private readonly IRuntimeDataSource source;
        private readonly object gate = new object();
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private readonly Dictionary<string, FileRecord> files = new Dictionary<string, FileRecord>(StringComparer.Ordinal);
        private readonly Dictionary<string, CachedFile> cache = new Dictionary<string, CachedFile>(StringComparer.Ordinal);
        private readonly Dictionary<string, JObject> entries = new Dictionary<string, JObject>(StringComparer.Ordinal);
        private readonly Dictionary<string, JObject> eventDefinitions = new Dictionary<string, JObject>(StringComparer.Ordinal);
        private JObject root = null!;
        private ProjectInfo info = null!;
        private bool chunked;
        private bool disposed;
        private bool opened;
        private readonly List<string> permanentPins = new List<string>();
        public JsonProjectLoader(IRuntimeDataSource source) { this.source = source ?? throw new ArgumentNullException(nameof(source)); }
        public async Task<ProjectInfo> OpenAsync(CancellationToken cancellationToken)
        {
            if (opened) throw new InvalidOperationException("A loader belongs to one project.");
            opened = true;
            var manifestBytes = await source.ReadAsync("manifest.json", cancellationToken);
            var manifest = Parse(manifestBytes);
            Version(manifest); if (Integer(manifest, "runtimeSchemaVersion") != 1) throw Invalid("UnsupportedVersion", "runtimeSchemaVersion");
            foreach (var token in Array(manifest, "files"))
            {
                var file = Object(token); var path = RuntimePath.Validate(Text(file, "path")); var hash = Text(file, "sha256"); var bytes = Integer(file, "bytes");
                if (hash.Length != 64 || hash.Any(c => !Uri.IsHexDigit(c)) || bytes < 0 || files.ContainsKey(path)) throw Invalid("InvalidManifest", path);
                files.Add(path, new FileRecord { Hash = hash.ToLowerInvariant(), Bytes = bytes });
            }
            chunked = files.ContainsKey("project.runtime.json");
            var rootPath = chunked ? "project.runtime.json" : "dialogues.runtime.json";
            root = await Acquire(rootPath, permanentPins, cancellationToken); Version(root);
            var defaultLocale = Text(root, "defaultLocale");
            var locales = Array(root, "locales").Select(String).ToArray();
            if (!locales.Contains(defaultLocale, StringComparer.Ordinal) || locales.Distinct(StringComparer.Ordinal).Count() != locales.Length ||
                Text(manifest, "defaultLocale") != defaultLocale || !Array(manifest, "locales").Select(String).SequenceEqual(locales)) throw Invalid("InvalidLocales", "Locale declarations disagree.");
            var resources = Obj(root, "resources"); var names = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var p in Obj(resources, "characters").Properties())
            {
                var character = Object(p.Value); var nameKey = Text(character, "nameKey");
                // Schema v1 exports speakerId as a character key; accept UUID references too.
                foreach (var reference in new[] { p.Name, Text(character, "key") }.Distinct(StringComparer.Ordinal))
                { if (names.ContainsKey(reference)) throw Invalid("AmbiguousCharacter", reference); names.Add(reference, nameKey); }
            }
            var variables = new Dictionary<string, VariableDefinition>(StringComparer.Ordinal);
            foreach (var p in Obj(resources, "variables").Properties())
            {
                var v = Object(p.Value); var key = Text(v, "key"); var value = Scalar(Required(v, "defaultValue"));
                if (TypeName(value.Type) != Text(v, "type") || variables.ContainsKey(key)) throw Invalid("InvalidVariable", key);
                variables.Add(key, new VariableDefinition(key, value));
            }
            foreach (var p in Obj(resources, "events").Properties())
            {
                var definition = Object(p.Value); var key = Text(definition, "key");
                if (eventDefinitions.ContainsKey(key)) throw Invalid("InvalidEvent", key);
                var parameterKeys = new HashSet<string>(StringComparer.Ordinal);
                foreach (var parameter in Array(definition, "params"))
                {
                    var spec = Object(parameter); var type = Text(spec, "type");
                    if (!parameterKeys.Add(Text(spec, "key")) || (type != "boolean" && type != "number" && type != "string")) throw Invalid("InvalidEvent", key);
                    if (spec["required"] != null && spec["required"]!.Type != JTokenType.Boolean) throw Invalid("InvalidEvent", key);
                    if (spec["defaultValue"] != null && spec["defaultValue"]!.Type != JTokenType.Null && TypeName(Scalar(spec["defaultValue"]!).Type) != type) throw Invalid("InvalidEvent", key);
                }
                eventDefinitions.Add(key, definition);
            }
            var keys = new Dictionary<string, string>(StringComparer.Ordinal); var unique = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in Obj(root, "dialogues").Properties())
            {
                Uuid(p.Name); var entry = Object(p.Value); var key = Text(entry, "key");
                if (!unique.Add(key)) throw Invalid("DuplicateDialogueKey", key);
                keys.Add(p.Name, key); entries.Add(p.Name, entry);
                if (chunked) { CheckPath(Text(entry, "structurePath")); ValidateLocalePaths(Obj(entry, "localePaths"), locales); }
            }
            if (chunked) ValidateLocalePaths(Obj(root, "localePaths"), locales);
            else foreach (var locale in locales) CheckPath("locales/" + locale + ".json");
            // Canonical file records identify content independently of manifest whitespace/order.
            var fingerprint = Hash(Encoding.UTF8.GetBytes("siming-json-v1\n" + string.Join("\n", files.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => p.Key + "\t" + p.Value.Bytes.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\t" + p.Value.Hash))));
            info = new ProjectInfo(fingerprint, defaultLocale, locales, keys, names, variables);
            if (chunked && Obj(root, "localePaths")[defaultLocale] != null)
            {
                var global = await Acquire(Text(Obj(root, "localePaths"), defaultLocale), permanentPins, cancellationToken);
                _ = LocaleTexts(global, defaultLocale);
            }
            return info;
        }
        private void ValidateLocalePaths(JObject paths, string[] locales)
        { foreach (var p in paths.Properties()) { if (!locales.Contains(p.Name, StringComparer.Ordinal)) throw Invalid("InvalidLocales", p.Name); CheckPath(String(p.Value)); } }
        private void CheckPath(string path) { RuntimePath.Validate(path); if (!files.ContainsKey(path)) throw Invalid("UnlistedFile", path); }
        public async Task<LoadedDialogue> LoadAsync(string dialogueId, string locale, CancellationToken cancellationToken)
        {
            if (disposed) throw new ObjectDisposedException(nameof(JsonProjectLoader));
            if (info == null) throw new InvalidOperationException("Open the project first.");
            if (!entries.TryGetValue(dialogueId, out var entry)) throw Invalid("UnknownDialogue", dialogueId);
            if (!info.Locales.Contains(locale)) throw Invalid("InvalidLocales", locale);
            var pins = new List<string>();
            try
            {
                var definition = entry; var texts = new Dictionary<string, string>(StringComparer.Ordinal);
                if (chunked)
                {
                    var structure = await Acquire(Text(entry, "structurePath"), pins, cancellationToken); Version(structure);
                    var dialogues = Obj(structure, "dialogues");
                    foreach (var p in dialogues.Properties())
                        if (!entries.TryGetValue(p.Name, out var indexed) || Text(indexed, "structurePath") != Text(entry, "structurePath") || Text(Object(p.Value), "key") != Text(indexed, "key")) throw Invalid("InvalidReference", p.Name);
                    definition = Object(dialogues[dialogueId] ?? throw Invalid("MissingDialogue", dialogueId));
                    foreach (var paths in new[] { Obj(root, "localePaths"), Obj(entry, "localePaths") })
                    {
                        if (paths[locale] == null) continue;
                        var resource = await Acquire(Text(paths, locale), pins, cancellationToken);
                        foreach (var p in LocaleTexts(resource, locale))
                        { if (texts.ContainsKey(p.Key)) throw Invalid("DuplicateText", p.Key); texts.Add(p.Key, p.Value); }
                    }
                }
                else
                {
                    var resource = await Acquire("locales/" + locale + ".json", pins, cancellationToken);
                    texts = LocaleTexts(resource, locale);
                }
                var dialogue = ParseDialogue(dialogueId, definition);
                foreach (var node in dialogue.Nodes.Values)
                {
                    if (node.TextKey != null && !texts.ContainsKey(node.TextKey)) throw Invalid("MissingText", node.TextKey);
                    foreach (var c in node.Choices) if (!texts.ContainsKey(c.TextKey)) throw Invalid("MissingText", c.TextKey);
                    if (node.SpeakerId != null && (!info.CharacterNameKeys.TryGetValue(node.SpeakerId, out var name) || !texts.ContainsKey(name))) throw Invalid("MissingCharacter", node.SpeakerId);
                }
                cancellationToken.ThrowIfCancellationRequested();
                return new LoadedDialogue(dialogue, texts, locale, () => Release(pins));
            }
            catch { Release(pins); throw; }
        }
        private async Task<JObject> Acquire(string path, List<string> pins, CancellationToken token)
        {
            CheckPath(path); CachedFile entry;
            lock (gate)
            {
                if (disposed) throw new ObjectDisposedException(nameof(JsonProjectLoader));
                if (!cache.TryGetValue(path, out entry!)) { entry = new CachedFile { Task = ReadVerified(path) }; cache.Add(path, entry); }
                entry.References++; pins.Add(path);
            }
            return await AsyncOperation.WaitAsync(entry.Task, token);
        }
        private async Task<JObject> ReadVerified(string path)
        {
            try
            {
                var bytes = await source.ReadAsync(path, lifetime.Token); var record = files[path];
                if (bytes.LongLength != record.Bytes || Hash(bytes) != record.Hash) throw Invalid("IntegrityFailure", path);
                return Parse(bytes);
            }
            catch (SimingException) { throw; }
            catch (Exception ex) { throw new SimingException("ReadFailure", path, ex); }
        }
        private void Release(List<string> paths)
        {
            lock (gate) foreach (var path in paths)
            {
                if (!cache.TryGetValue(path, out var file)) continue;
                file.References--;
                if (file.References == 0 && (file.Task.IsFaulted || file.Task.IsCanceled)) cache.Remove(path);
            }
        }
        public void ClearUnusedChunks()
        {
            lock (gate) foreach (var path in cache.Where(p => p.Value.References == 0 && p.Value.Task.IsCompleted).Select(p => p.Key).ToArray()) cache.Remove(path);
        }
        public void Dispose()
        {
            lock (gate) { if (disposed) return; disposed = true; cache.Clear(); }
            try { lifetime.Cancel(); } finally { lifetime.Dispose(); }
        }
        private static Dictionary<string, string> LocaleTexts(JObject resource, string locale)
        { Version(resource); if (Text(resource, "locale") != locale) throw Invalid("InvalidLocales", locale); return Obj(resource, "texts").Properties().ToDictionary(p => p.Name, p => String(p.Value), StringComparer.Ordinal); }
        private RuntimeDialogue ParseDialogue(string id, JObject definition)
        {
            var nodes = new Dictionary<string, RuntimeNode>(StringComparer.Ordinal);
            foreach (var p in Obj(definition, "nodes").Properties())
            {
                Uuid(p.Name); var n = Object(p.Value); var kind = Text(n, "type");
                var type = kind switch { "start" => NodeType.Start, "dialogue" => NodeType.Dialogue, "choice" => NodeType.Choice, "condition" => NodeType.Condition, "event" => NodeType.Event, "end" => NodeType.End, _ => throw Invalid("UnknownNodeType", kind) };
                var messages = new List<HostMessage>();
                if (n["hostEvents"] != null) foreach (var message in Array(n, "hostEvents"))
                { var m = Object(message); messages.Add(new HostMessage(Text(m, "name"), Data(Obj(m, "payload")))); }
                string? next = null, speaker = null, text = null, yes = null, no = null, eventName = null;
                double? delay = null; Condition? condition = null; DataValue? parameters = null; var choices = new List<Choice>();
                if (type == NodeType.Start || type == NodeType.Dialogue || type == NodeType.Event) next = Text(n, "next");
                if (type == NodeType.Dialogue)
                {
                    text = Text(n, "textKey"); if (n["speakerId"] != null) speaker = Text(n, "speakerId");
                    if (n["advancePolicy"] != null)
                    {
                        var policy = Obj(n, "advancePolicy"); var mode = Text(policy, "mode");
                        if (mode == "auto") { delay = Integer(policy, "delayMs"); if (delay < 0) throw Invalid("InvalidDelay", text); }
                        else if (mode != "manual") throw Invalid("InvalidDelay", mode);
                    }
                }
                if (type == NodeType.Choice)
                {
                    var unique = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var token in Array(n, "choices"))
                    {
                        var choice = Object(token); var choiceId = Text(choice, "id");
                        if (!unique.Add(choiceId)) throw Invalid("DuplicateChoice", choiceId);
                        choices.Add(new Choice(choiceId, Text(choice, "textKey"), Text(choice, "next")));
                    }
                    if (choices.Count == 0) throw Invalid("InvalidChoice", p.Name);
                }
                if (type == NodeType.Condition)
                { condition = ParseCondition(Obj(n, "condition")); yes = Text(Obj(n, "branches"), "true"); no = Text(Obj(n, "branches"), "false"); }
                if (type == NodeType.Event) { eventName = Text(n, "event"); parameters = ParseParameters(eventName, Obj(n, "params")); }
                nodes.Add(p.Name, new RuntimeNode(Text(n, "key"), type, messages, next, speaker, text, delay, choices, condition, yes, no, eventName, parameters));
            }
            void Target(string target) { Uuid(target); if (!nodes.ContainsKey(target)) throw Invalid("MissingNode", target); }
            var entry = Text(definition, "entryNodeId"); Target(entry);
            foreach (var node in nodes.Values)
            {
                if (node.Next != null) Target(node.Next);
                if (node.TrueTarget != null) Target(node.TrueTarget);
                if (node.FalseTarget != null) Target(node.FalseTarget);
                foreach (var choice in node.Choices) Target(choice.Next);
            }
            return new RuntimeDialogue(id, Text(definition, "key"), entry, nodes);
        }
        private Condition ParseCondition(JObject expression)
        {
            foreach (var op in new[] { "all", "any", "not" }) if (expression[op] != null)
            {
                if (expression.Count != 1) throw Invalid("InvalidCondition", op);
                var children = op == "not" ? new[] { ParseCondition(Obj(expression, op)) } : Array(expression, op).Select(t => ParseCondition(Object(t))).ToArray();
                if (children.Length == 0) throw Invalid("InvalidCondition", op);
                return new Condition(op, children);
            }
            var key = Text(expression, "variable"); var comparison = Text(expression, "operator"); var value = Scalar(Required(expression, "value"));
            if (expression.Count != 3 || !info.Variables.TryGetValue(key, out var definition) || definition.Type != value.Type ||
                !new[] { "==", "!=", ">", ">=", "<", "<=" }.Contains(comparison) || (value.Type != VariableType.Number && comparison != "==" && comparison != "!=")) throw Invalid("InvalidCondition", key);
            return new Condition(comparison, key, value);
        }
        private DataValue ParseParameters(string eventName, JObject parameters)
        {
            if (eventName == "variable.set" || eventName == "variable.add")
            {
                var key = Text(parameters, "key"); var value = Scalar(Required(parameters, "value"));
                if (!info.Variables.TryGetValue(key, out var variable) || variable.Type != value.Type || (eventName == "variable.add" && value.Type != VariableType.Number)) throw Invalid("InvalidEventParameters", eventName);
                return Data(parameters);
            }
            if (!eventDefinitions.TryGetValue(eventName, out var definition)) throw Invalid("UnknownEvent", eventName);
            var result = (JObject)parameters.DeepClone(); var allowed = new HashSet<string>(StringComparer.Ordinal);
            foreach (var token in Array(definition, "params"))
            {
                var spec = Object(token); var key = Text(spec, "key"); allowed.Add(key);
                if (result[key] == null && spec["defaultValue"] != null && spec["defaultValue"]!.Type != JTokenType.Null) result[key] = spec["defaultValue"]!.DeepClone();
                if (result[key] == null) { if (spec["required"]?.Value<bool>() == true) throw Invalid("InvalidEventParameters", key); }
                else if (TypeName(Scalar(result[key]!).Type) != Text(spec, "type")) throw Invalid("InvalidEventParameters", key);
            }
            if (result.Properties().Any(p => !allowed.Contains(p.Name))) throw Invalid("InvalidEventParameters", eventName);
            return Data(result);
        }
        private static DataValue Data(JToken token) => token.Type switch
        {
            JTokenType.Null => DataValue.Null, JTokenType.Boolean => DataValue.From(token.Value<bool>()),
            JTokenType.Integer => DataValue.From(token.Value<double>()), JTokenType.Float => DataValue.From(token.Value<double>()),
            JTokenType.String => DataValue.From(token.Value<string>()!), JTokenType.Array => DataValue.From(token.Select(Data)),
            JTokenType.Object => DataValue.From(((JObject)token).Properties().ToDictionary(p => p.Name, p => Data(p.Value), StringComparer.Ordinal)),
            _ => throw Invalid("InvalidJson", token.Type.ToString())
        };
        private static VariableValue Scalar(JToken token) => Data(token).Scalar;
        private static string TypeName(VariableType type) => type.ToString().ToLowerInvariant();
        private static JObject Parse(byte[] bytes)
        {
            try
            {
                using var input = new StringReader(new UTF8Encoding(false, true).GetString(bytes));
                using var reader = new JsonTextReader(input) { DateParseHandling = DateParseHandling.None, MaxDepth = 128 };
                var result = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
                if (reader.Read()) throw Invalid("InvalidJson", "Trailing JSON content."); return result;
            }
            catch (SimingException) { throw; }
            catch (Exception ex) { throw new SimingException("InvalidJson", "Invalid runtime JSON.", ex); }
        }
        private static string Hash(byte[] bytes) { using var sha = SHA256.Create(); return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        private static void Version(JObject obj) { if (Integer(obj, "schemaVersion") != 1) throw Invalid("UnsupportedVersion", "schemaVersion"); }
        private static void Uuid(string id) { if (!Guid.TryParseExact(id, "D", out _)) throw Invalid("InvalidId", id); }
        private static SimingException Invalid(string code, string message) => new SimingException(code, message);
        private static JToken Required(JObject obj, string key) => obj[key] ?? throw Invalid("MissingField", key);
        private static JObject Object(JToken token) => token as JObject ?? throw Invalid("InvalidJson", "Expected object.");
        private static JObject Obj(JObject obj, string key) => Object(Required(obj, key));
        private static JArray Array(JObject obj, string key) => Required(obj, key) as JArray ?? throw Invalid("InvalidJson", "Expected array: " + key);
        private static string String(JToken token) => token.Type == JTokenType.String ? token.Value<string>()! : throw Invalid("InvalidJson", "Expected string.");
        private static string Text(JObject obj, string key) { var value = String(Required(obj, key)); return value.Length > 0 ? value : throw Invalid("InvalidJson", "Empty field: " + key); }
        private static long Integer(JObject obj, string key)
        {
            var token = Required(obj, key); if (token.Type != JTokenType.Integer) throw Invalid("InvalidJson", "Expected integer: " + key);
            try { return token.Value<long>(); } catch (Exception ex) { throw new SimingException("InvalidJson", "Integer out of range: " + key, ex); }
        }
    }
}
