using System;
using System.Threading;
using System.Threading.Tasks;
using Siming;
using Siming.Serialization.Json;
using Siming.Unity;
using UnityEngine;

public sealed class SmokeRunner : MonoBehaviour, IBusinessEventHandler
{
    private async void Start()
    {
        var args = Environment.GetCommandLineArgs();
        if (Array.IndexOf(args, "--siming-smoke") < 0 && Array.IndexOf(args, "SimingValidation.Play") < 0) return;
        int code = 0;
        try
        {
            using var project = await SimingProject.OpenAsync(new JsonProjectLoader(new StreamingAssetsDataSource("Siming")));
            using var session = project.CreateSession(businessEvents: this, locale: "en-US");
            await session.StartByKeyAsync("sdk_demo");
            if (session.Current.Text != "Welcome to Siming.") throw new Exception("Dialogue text mismatch");
            var state = session.CaptureState(); int messages = 0;
            session.HostEventReceived += _ => messages++;
            await session.SetLocaleAsync("zh-CN"); await session.RestoreStateAsync(state);
            if (messages != 0) throw new Exception("Restore replayed messages");
            await session.ContinueAsync(); await session.ChooseAsync("accept"); await session.TickAsync(1);
            if (session.Current.Status != SessionStatus.Completed || session.Variables.Get("score").Number != 2) throw new Exception("Branch execution failed");
            Debug.Log("SIMING_UNITY_SMOKE_PASS");
        }
        catch (Exception ex) { Debug.LogException(ex); code = 1; }
#if UNITY_EDITOR
        UnityEditor.EditorApplication.Exit(code);
#else
        Application.Quit(code);
#endif
    }
    public async Task ExecuteAsync(string name, DataValue parameters, BusinessEventContext context, CancellationToken token)
    {
        if (name != "quest.begin" || parameters.Fields["quest"].Scalar.String != "first") throw new Exception("Event parameters mismatch");
        await Task.Delay(10, token);
    }
}
