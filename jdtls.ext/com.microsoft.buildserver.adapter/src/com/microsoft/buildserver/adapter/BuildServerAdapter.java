package com.microsoft.buildserver.adapter;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.nio.file.Paths;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.eclipse.core.runtime.FileLocator;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.Plugin;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.managers.DigestStore;
import org.eclipse.lsp4j.jsonrpc.Launcher;
import org.osgi.framework.BundleContext;

import ch.epfl.scala.bsp4j.BuildServer;

public class BuildServerAdapter extends Plugin {

    private static BuildServerAdapter adapterInstance;

    private DigestStore digestStore;

    private BuildServer buildServer;
    private BspClient buildClient;

    @Override
    public void start(BundleContext context) throws Exception {
        BuildServerAdapter.adapterInstance = this;
        digestStore = new DigestStore(getStateLocation().toFile());
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        BuildServerAdapter.adapterInstance = null;
    }

    public static BuildServerAdapter getInstance() {
        return BuildServerAdapter.adapterInstance;
    }

    public static DigestStore getDigestStore() {
        return adapterInstance.digestStore;
	}

    public static BuildServer getBuildServer() {
        if (adapterInstance.buildServer == null) {
            String javaExecutablePath = getJavaExecutablePath();
            if (javaExecutablePath == null) {
                return null;
            }

            String[] classpaths = getBuildServerRuntimeClasspath();
            if (classpaths.length == 0) {
                return null;
            }
            ProcessBuilder build = new ProcessBuilder(
                javaExecutablePath,
                "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=8989",
                "-cp",
                String.join(";", classpaths),
                "com.microsoft.java.bs.core.JavaBspLauncher"
            );

            try {
                Process process = build.start();
                ExecutorService fixedThreadPool = Executors.newFixedThreadPool(1);
                adapterInstance.buildClient = new BspClient();
                Launcher<BuildServer> launcher = new Launcher.Builder<BuildServer>()
                .setOutput(process.getOutputStream())
                .setInput(process.getInputStream())
                .setLocalService(adapterInstance.buildClient)
                .setExecutorService(fixedThreadPool)
                .setRemoteInterface(BuildServer.class)
                .create();

                launcher.startListening();
                adapterInstance.buildServer = launcher.getRemoteProxy();
                adapterInstance.buildClient.onConnectWithServer(adapterInstance.buildServer);
            } catch (IOException e) {
                return null;
            }
        }
        return adapterInstance.buildServer;
    }

    private static String getJavaExecutablePath() {
        Optional<String> command = ProcessHandle.current().info().command();
        if (command.isPresent()) {
            return command.get();
        }

        return "";
    }

    private static String[] getBuildServerRuntimeClasspath() {
        try {
            URL fileURL = FileLocator.toFileURL(BuildServerAdapter.class.getResource("/bsp"));
            File file = new File(fileURL.getPath());
            return new String[]{
                Paths.get(file.getAbsolutePath(), "server.jar").toString(),
                Paths.get(file.getAbsolutePath(), "libs").toString() + Path.SEPARATOR + "*"
            };
        } catch (Exception e) {
            JavaLanguageServerPlugin.logException("Unable to get build server runtime classpath", e);
            return new String[0];
        }
    }
}
