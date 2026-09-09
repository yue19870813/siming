#nullable enable
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Siming;
using Siming.Unity;
using UnityEngine;

namespace Siming.Samples
{
    [RequireComponent(typeof(SimingPlayer))]
    public sealed class BasicDialogue : MonoBehaviour, IBusinessEventHandler
    {
        private SimingPlayer player = null!;
        private PlaybackState? savedPosition;
        private IReadOnlyDictionary<string, VariableValue>? savedVariables;
        private MemoryVariableStore? variables;
        private string lastError = "";
        private async void Start()
        {
            player = GetComponent<SimingPlayer>();
            await Guard(async () =>
            {
                // Custom storage is optional. Here the host keeps it to demonstrate saving values separately.
                variables = new MemoryVariableStore(new[] { new VariableDefinition("accepted", new VariableValue(false)),
                    new VariableDefinition("score", new VariableValue(0d)), new VariableDefinition("title", new VariableValue("hero")) });
                await player.OpenAsync("Siming", this, variables, "en-US");
                if (player.Session != null) await player.Session.StartByKeyAsync("sdk_demo");
            });
        }
        public async Task ExecuteAsync(string eventName, DataValue parameters, BusinessEventContext context, CancellationToken cancellationToken)
        {
            if (eventName != "quest.begin") throw new InvalidOperationException("Unknown business event: " + eventName);
            Debug.Log("Starting quest: " + parameters.Fields["quest"].Scalar.String);
            await Task.Delay(300, cancellationToken);
        }
        private void OnGUI()
        {
            GUILayout.BeginArea(new Rect(20, 20, 560, 540), GUI.skin.box);
            var session = player == null ? null : player.Session;
            if (session == null) GUILayout.Label("Loading Siming…");
            else
            {
                var current = session.Current;
                GUILayout.Label($"{current.Status} · {current.Locale}");
                GUILayout.Label(current.SpeakerName ?? "");
                GUILayout.Label(current.Text ?? "");
                GUI.enabled = !session.IsBusy;
                if (current.Status == SessionStatus.WaitingDialogue && GUILayout.Button("Continue")) Fire(() => session.ContinueAsync());
                if (current.Status == SessionStatus.WaitingChoice) foreach (var choice in current.Choices)
                    if (GUILayout.Button(choice.Text)) Fire(() => session.ChooseAsync(choice.Id));
                bool waiting = current.Status == SessionStatus.WaitingDialogue || current.Status == SessionStatus.WaitingChoice;
                if (waiting)
                {
                    if (GUILayout.Button("中文 / English")) Fire(() => session.SetLocaleAsync(current.Locale == "en-US" ? "zh-CN" : "en-US"));
                    if (GUILayout.Button("Host: capture in memory")) { savedPosition = session.CaptureState(); savedVariables = variables!.CaptureValues(); }
                }
                if (savedPosition != null && savedVariables != null && GUILayout.Button("Host: restore captured state"))
                    Fire(async () => { variables!.RestoreValues(savedVariables); await session.RestoreStateAsync(savedPosition); });
                if ((current.Status == SessionStatus.Completed || current.Status == SessionStatus.Stopped || current.Status == SessionStatus.Faulted) && GUILayout.Button("Restart")) Fire(() => session.StartByKeyAsync("sdk_demo"));
                GUI.enabled = true;
            }
            GUILayout.Label(lastError); GUILayout.EndArea();
        }
        private async void Fire(Func<Task> operation) => await Guard(operation);
        private async Task Guard(Func<Task> operation)
        { try { await operation(); } catch (OperationCanceledException) { } catch (Exception ex) { lastError = ex.Message; Debug.LogException(ex); } }
    }
}
