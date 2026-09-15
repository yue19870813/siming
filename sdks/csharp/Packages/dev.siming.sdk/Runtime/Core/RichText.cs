using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace Siming
{
    public sealed class TextStyle
    {
        public bool Bold { get; }
        public bool Italic { get; }
        public string? Color { get; }
        public TextStyle(bool bold = false, bool italic = false, string? color = null)
        {
            if (color != null && (color.Length != 7 || color[0] != '#' || !color.Skip(1).All(Uri.IsHexDigit))) throw new ArgumentException("Expected #RRGGBB", nameof(color));
            Bold = bold; Italic = italic; Color = color?.ToUpperInvariant();
        }
    }
    public sealed class TextRun
    {
        public string Text { get; }
        public TextStyle Style { get; }
        public TextRun(string text, TextStyle? style = null) { Text = text ?? throw new ArgumentNullException(nameof(text)); Style = style ?? new TextStyle(); }
    }
    public sealed class RichText
    {
        public IReadOnlyList<TextRun> Runs { get; }
        public string PlainText { get; }
        public RichText(IEnumerable<TextRun> runs) { Runs = Immutable.List(runs); PlainText = string.Concat(Runs.Select(run => run.Text)); }
        public static RichText FromPlainText(string text) => new RichText(new[] { new TextRun(text) });
    }
    /// <summary>Converts engine-independent runs to TMP markup without depending on Unity.</summary>
    public static class TextMeshProFormatter
    {
        public static string Format(RichText text)
        {
            var output = new StringBuilder();
            foreach (var run in text.Runs)
            {
                if (run.Style.Bold) output.Append("<b>");
                if (run.Style.Italic) output.Append("<i>");
                if (run.Style.Color != null) output.Append("<color=").Append(run.Style.Color).Append('>');
                // Isolate each '<' so literal </noparse> cannot terminate the escape span.
                foreach (var part in run.Text.Split('<').Select((value, index) => new { value, index }))
                { if (part.index > 0) output.Append("<noparse><</noparse>"); output.Append(part.value); }
                if (run.Style.Color != null) output.Append("</color>");
                if (run.Style.Italic) output.Append("</i>");
                if (run.Style.Bold) output.Append("</b>");
            }
            return output.ToString();
        }
    }
}
