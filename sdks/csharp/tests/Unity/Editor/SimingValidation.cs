using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class SimingValidation
{
    private static string Scene()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new GameObject("Siming smoke").AddComponent<SmokeRunner>();
        new GameObject("Dialogue sample").AddComponent<Siming.Samples.BasicDialogue>();
        const string path = "Assets/SimingSample.unity";
        EditorSceneManager.SaveScene(scene, path);
        return path;
    }
    public static void Play() { Scene(); EditorApplication.EnterPlaymode(); }
    public static void BuildMac()
    {
        var scene = Scene();
        PlayerSettings.productName = "SimingSmoke";
        PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);
        PlayerSettings.SetApiCompatibilityLevel(UnityEditor.Build.NamedBuildTarget.Standalone, ApiCompatibilityLevel.NET_Standard);
        PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.Standalone, ManagedStrippingLevel.High);
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { scene },
            locationPathName = "Builds/SimingSmoke.app", target = BuildTarget.StandaloneOSX, options = BuildOptions.Development });
        if (report.summary.result != BuildResult.Succeeded) throw new Exception("IL2CPP build failed: " + report.summary.result);
        Debug.Log("SIMING_IL2CPP_BUILD_PASS");
    }
}
