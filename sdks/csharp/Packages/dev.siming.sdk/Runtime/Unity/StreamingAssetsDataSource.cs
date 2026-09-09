#nullable enable
using System;
using System.Threading;
using System.Threading.Tasks;
using Siming.Serialization.Json;
using UnityEngine;
using UnityEngine.Networking;

namespace Siming.Unity
{
    /// <summary>Create and use on the Unity main thread. Android StreamingAssets may live inside an APK.</summary>
    public sealed class StreamingAssetsDataSource : IRuntimeDataSource
    {
        private readonly string baseUrl;
        private readonly int mainThread = Thread.CurrentThread.ManagedThreadId;
        public StreamingAssetsDataSource(string relativeDirectory = "Siming")
        {
            RuntimePath.Validate(relativeDirectory);
            var root = Application.streamingAssetsPath;
            baseUrl = (root.Contains("://") ? root.TrimEnd('/') : new Uri(root.TrimEnd('/') + "/").AbsoluteUri.TrimEnd('/')) + "/" + Escape(relativeDirectory) + "/";
        }
        private static string Escape(string path) => string.Join("/", System.Array.ConvertAll(path.Split('/'), Uri.EscapeDataString));
        public async Task<byte[]> ReadAsync(string path, CancellationToken cancellationToken)
        {
            if (Thread.CurrentThread.ManagedThreadId != mainThread) throw new InvalidOperationException("Unity data sources require the main thread.");
            RuntimePath.Validate(path); cancellationToken.ThrowIfCancellationRequested();
            using var request = UnityWebRequest.Get(baseUrl + Escape(path));
            var operation = request.SendWebRequest();
            while (!operation.isDone)
            {
                if (cancellationToken.IsCancellationRequested) { request.Abort(); cancellationToken.ThrowIfCancellationRequested(); }
                await Task.Yield();
            }
            cancellationToken.ThrowIfCancellationRequested();
            if (request.result != UnityWebRequest.Result.Success) throw new SimingException("ReadFailure", path + ": " + request.error);
            return request.downloadHandler.data;
        }
    }
}
