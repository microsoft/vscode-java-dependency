package com.microsoft.buildserver.adapter.bsp4j.extended;

import ch.epfl.scala.bsp4j.JvmBuildTarget;

public class JvmBuildTargetExt extends JvmBuildTarget {

    String sourceLanguageLevel;

    String targetBytecodeVersion;

    public JvmBuildTargetExt(String javaHome, String javaVersion) {
        super(javaHome, javaVersion);
    }

    public String getSourceLanguageLevel() {
        return sourceLanguageLevel;
    }

    public void setSourceLanguageLevel(String sourceLanguageLevel) {
        this.sourceLanguageLevel = sourceLanguageLevel;
    }

    public String getTargetBytecodeVersion() {
        return targetBytecodeVersion;
    }

    public void setTargetBytecodeVersion(String targetBytecodeVersion) {
        this.targetBytecodeVersion = targetBytecodeVersion;
    }
}
