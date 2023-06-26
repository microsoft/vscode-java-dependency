package com.microsoft.buildserver.adapter;

import java.util.Arrays;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProgressReport;
import org.eclipse.lsp4j.ExecuteCommandParams;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.DidChangeBuildTarget;
import ch.epfl.scala.bsp4j.LogMessageParams;
import ch.epfl.scala.bsp4j.PublishDiagnosticsParams;
import ch.epfl.scala.bsp4j.ShowMessageParams;
import ch.epfl.scala.bsp4j.TaskDataKind;
import ch.epfl.scala.bsp4j.TaskFinishParams;
import ch.epfl.scala.bsp4j.TaskProgressParams;
import ch.epfl.scala.bsp4j.TaskStartParams;

public class BspClient implements BuildClient {

	private ConcurrentHashMap<String, ProgressReport> taskMap = new ConcurrentHashMap<>();

	@Override
	public void onBuildShowMessage(ShowMessageParams params) {
	}

	@Override
	public void onBuildLogMessage(LogMessageParams params) {
	}

	@Override
	public void onBuildTaskStart(TaskStartParams params) {
		if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
			ExecuteCommandParams clientCommand = new ExecuteCommandParams("_java.buildServer.gradle.buildStart", Arrays.asList(params.getMessage()));
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendNotification(clientCommand);
		} else {
			ProgressReport progressReport = new ProgressReport(params.getTaskId().getId());
			progressReport.setTask("Build Server Task");
			progressReport.setStatus(params.getMessage());
			progressReport.setComplete(false);
			taskMap.put(params.getTaskId().getId(), progressReport);
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendProgressReport(progressReport);
		}
	}

	@Override
	public void onBuildTaskProgress(TaskProgressParams params) {
		ProgressReport progressReport = taskMap.get(params.getTaskId().getId());
		if (progressReport == null) {
			return;
		}
		progressReport.setStatus(params.getMessage());
		JavaLanguageServerPlugin.getProjectsManager().getConnection().sendProgressReport(progressReport);
	}

	@Override
	public void onBuildTaskFinish(TaskFinishParams params) {
		if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_REPORT)) {
			ExecuteCommandParams clientCommand = new ExecuteCommandParams("_java.buildServer.gradle.buildComplete", Arrays.asList(params.getMessage()));
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendNotification(clientCommand);
		} else {
			ProgressReport progressReport = taskMap.get(params.getTaskId().getId());
			if (progressReport == null) {
				return;
			}
			progressReport.setComplete(true);
			progressReport.setStatus(params.getMessage());
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendProgressReport(progressReport);
	
			taskMap.remove(params.getTaskId().getId());
		}
	}

	@Override
	public void onBuildPublishDiagnostics(PublishDiagnosticsParams params) {
	}

	@Override
	public void onBuildTargetDidChange(DidChangeBuildTarget params) {
	}
}
