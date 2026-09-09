using System;
using System.Threading;
using System.Threading.Tasks;
using Siming;
using Siming.Serialization.Json;

if (args.Length < 1) { Console.WriteLine("Usage: Siming.Console <export-directory> [dialogue-key] [locale]"); return; }
using var project = await SimingProject.OpenAsync(new JsonProjectLoader(new DirectoryDataSource(args[0])));
using var session = project.CreateSession(businessEvents: new Events(), locale: args.Length > 2 ? args[2] : null);
session.HostEventReceived += message => Console.WriteLine($"HOST {message.Message.Name}");
await session.StartByKeyAsync(args.Length > 1 ? args[1] : "sdk_demo");
while (session.Current.Status == SessionStatus.WaitingDialogue || session.Current.Status == SessionStatus.WaitingChoice)
{
    var view = session.Current;
    Console.WriteLine($"{view.SpeakerName}: {view.Text}");
    if (view.Status == SessionStatus.WaitingDialogue) { Console.ReadLine(); await session.ContinueAsync(); }
    else
    {
        foreach (var choice in view.Choices) Console.WriteLine($"{choice.Id}: {choice.Text}");
        var selected = Console.ReadLine(); if (selected == null) break;
        try { await session.ChooseAsync(selected); } catch (SimingException ex) when (ex.Code == "UnknownChoice") { Console.WriteLine(ex.Message); }
    }
}
Console.WriteLine(session.Current.Status);
sealed class Events : IBusinessEventHandler
{
    public Task ExecuteAsync(string name, DataValue parameters, BusinessEventContext context, CancellationToken token)
    { Console.WriteLine($"BUSINESS {name} (console demonstration)"); return Task.CompletedTask; }
}
