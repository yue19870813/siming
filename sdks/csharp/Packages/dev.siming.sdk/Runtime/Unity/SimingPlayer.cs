#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Siming.Serialization.Json;
using UnityEngine;

namespace Siming.Unity
{
    public sealed class SimingPlayer : MonoBehaviour
    {
        [SerializeField] private bool useUnscaledTime;
        private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
        private SimingProject? project;
        private bool opening;
        public DialogueSession? Session { get; private set; }
        public bool UseUnscaledTime { get => useUnscaledTime; set => useUnscaledTime = value; }
        public async Task OpenAsync(string directory = "Siming", IBusinessEventHandler? businessEvents = null, IVariableStore? variables = null, string? locale = null)
        {
            if (opening || project != null) throw new InvalidOperationException("This player already has a project. Destroy it before opening another.");
            opening = true;
            try
            {
                var result = await SimingProject.OpenAsync(new JsonProjectLoader(new StreamingAssetsDataSource(directory)), lifetime.Token);
                if (lifetime.IsCancellationRequested) { result.Dispose(); return; }
                project = result; Session = result.CreateSession(variables, businessEvents, locale);
                Session.Diagnostic += failure => Debug.LogWarning($"Siming [{failure.Code}]: {failure.Message}", this);
            }
            finally { opening = false; }
        }
        private async void Update()
        {
            var session = Session;
            if (session == null || session.IsBusy || session.Current.Status != SessionStatus.WaitingDialogue || session.Current.AutoDelayMs == null) return;
            try { await session.TickAsync(useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime, lifetime.Token); }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Debug.LogException(ex, this); }
        }
        private void OnDestroy() { lifetime.Cancel(); project?.Dispose(); lifetime.Dispose(); }
    }
}
