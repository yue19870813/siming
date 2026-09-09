#nullable enable
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Siming
{
    public sealed class SimingException : Exception
    {
        public string Code { get; }
        public string? DialogueId { get; }
        public string? NodeId { get; }
        public SimingException(string code, string message, Exception? inner = null, string? dialogueId = null, string? nodeId = null)
            : base(message, inner) { Code = code; DialogueId = dialogueId; NodeId = nodeId; }
    }

    public enum VariableType { Boolean, Number, String }

    public readonly struct VariableValue : IEquatable<VariableValue>
    {
        private readonly object? value;
        public VariableType Type { get; }
        public VariableValue(bool value) { Type = VariableType.Boolean; this.value = value; }
        public VariableValue(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) throw new SimingException("InvalidNumber", "Numbers must be finite.");
            Type = VariableType.Number; this.value = value;
        }
        public VariableValue(string value) { Type = VariableType.String; this.value = value ?? throw new ArgumentNullException(nameof(value)); }
        public bool Boolean => Type == VariableType.Boolean ? (bool)(value ?? false) : throw Mismatch();
        public double Number => Type == VariableType.Number ? (double)value! : throw Mismatch();
        public string String => Type == VariableType.String ? (string)value! : throw Mismatch();
        private static SimingException Mismatch() => new SimingException("VariableTypeMismatch", "Variable value has a different type.");
        public bool Equals(VariableValue other) => Type == other.Type && (Type == VariableType.Boolean ? Boolean == other.Boolean : Equals(value, other.value));
        public override bool Equals(object? obj) => obj is VariableValue other && Equals(other);
        public override int GetHashCode() => HashCode.Combine(Type, value ?? false);
        public override string ToString() => Type == VariableType.Boolean ? Boolean.ToString() : Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture)!;
    }

    // Immutable JSON tree. No serializer-specific types cross the host boundary.
    public sealed class DataValue
    {
        public enum ValueKind { Null, Boolean, Number, String, Array, Object }
        public ValueKind Kind { get; }
        private readonly object? value;
        private DataValue(ValueKind kind, object? value) { Kind = kind; this.value = value; }
        public static DataValue Null { get; } = new DataValue(ValueKind.Null, null);
        public static DataValue From(bool value) => new DataValue(ValueKind.Boolean, value);
        public static DataValue From(double value) { _ = new VariableValue(value); return new DataValue(ValueKind.Number, value); }
        public static DataValue From(string value) => new DataValue(ValueKind.String, value ?? throw new ArgumentNullException(nameof(value)));
        public static DataValue From(IEnumerable<DataValue> values) => new DataValue(ValueKind.Array, new List<DataValue>(values).AsReadOnly());
        public static DataValue From(IDictionary<string, DataValue> values) => new DataValue(ValueKind.Object, new ReadOnlyDictionary<string, DataValue>(new Dictionary<string, DataValue>(values, StringComparer.Ordinal)));
        public IReadOnlyDictionary<string, DataValue> Fields => Kind == ValueKind.Object ? (IReadOnlyDictionary<string, DataValue>)value! : throw Invalid();
        public IReadOnlyList<DataValue> Items => Kind == ValueKind.Array ? (IReadOnlyList<DataValue>)value! : throw Invalid();
        public VariableValue Scalar => Kind switch
        {
            ValueKind.Boolean => new VariableValue((bool)value!), ValueKind.Number => new VariableValue((double)value!),
            ValueKind.String => new VariableValue((string)value!), _ => throw Invalid()
        };
        private static SimingException Invalid() => new SimingException("InvalidValue", "Unexpected JSON value type.");
    }

    public sealed class VariableDefinition
    {
        public string Key { get; }
        public VariableValue DefaultValue { get; }
        public VariableType Type => DefaultValue.Type;
        public VariableDefinition(string key, VariableValue defaultValue) { Key = key; DefaultValue = defaultValue; }
    }

    public interface IVariableStore
    {
        VariableValue Get(string key);
        void Set(string key, VariableValue value);
    }

    public sealed class MemoryVariableStore : IVariableStore
    {
        private readonly Dictionary<string, VariableValue> values = new Dictionary<string, VariableValue>(StringComparer.Ordinal);
        public MemoryVariableStore(IEnumerable<VariableDefinition> definitions)
        { foreach (var definition in definitions) values.Add(definition.Key, definition.DefaultValue); }
        public VariableValue Get(string key) => values.TryGetValue(key, out var value) ? value : throw new SimingException("UnknownVariable", key);
        public void Set(string key, VariableValue value)
        {
            if (Get(key).Type != value.Type) throw new SimingException("VariableTypeMismatch", key);
            values[key] = value;
        }
        public IReadOnlyDictionary<string, VariableValue> CaptureValues() => new ReadOnlyDictionary<string, VariableValue>(new Dictionary<string, VariableValue>(values));
        public void RestoreValues(IReadOnlyDictionary<string, VariableValue> snapshot)
        {
            if (snapshot.Count != values.Count) throw new SimingException("InvalidVariables", "A complete variable snapshot is required.");
            foreach (var item in snapshot) if (Get(item.Key).Type != item.Value.Type) throw new SimingException("VariableTypeMismatch", item.Key);
            foreach (var item in snapshot) values[item.Key] = item.Value;
        }
    }

    internal sealed class ValidatedVariableStore : IVariableStore
    {
        private readonly IVariableStore store;
        private readonly IReadOnlyDictionary<string, VariableDefinition> definitions;
        public ValidatedVariableStore(IVariableStore store, IReadOnlyDictionary<string, VariableDefinition> definitions) { this.store = store; this.definitions = definitions; }
        private void Validate(string key, VariableValue value)
        {
            if (!definitions.TryGetValue(key, out var definition)) throw new SimingException("UnknownVariable", key);
            if (definition.Type != value.Type) throw new SimingException("VariableTypeMismatch", key);
        }
        public VariableValue Get(string key)
        {
            if (!definitions.ContainsKey(key)) throw new SimingException("UnknownVariable", key);
            var value = store.Get(key); Validate(key, value); return value;
        }
        public void Set(string key, VariableValue value) { Validate(key, value); store.Set(key, value); }
    }
}
