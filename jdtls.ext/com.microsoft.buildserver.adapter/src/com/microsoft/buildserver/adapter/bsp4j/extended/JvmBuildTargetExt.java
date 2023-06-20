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

    @Override
    public int hashCode() {
        final int prime = 31;
        int result = super.hashCode();
        result = prime * result + ((sourceLanguageLevel == null) ? 0 : sourceLanguageLevel.hashCode());
        result = prime * result + ((targetBytecodeVersion == null) ? 0 : targetBytecodeVersion.hashCode());
        return result;
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj)
            return true;
        if (!super.equals(obj))
            return false;
        if (getClass() != obj.getClass())
            return false;
        JvmBuildTargetExt other = (JvmBuildTargetExt) obj;
        if (sourceLanguageLevel == null) {
            if (other.sourceLanguageLevel != null)
                return false;
        } else if (!sourceLanguageLevel.equals(other.sourceLanguageLevel))
            return false;
        if (targetBytecodeVersion == null) {
            if (other.targetBytecodeVersion != null)
                return false;
        } else if (!targetBytecodeVersion.equals(other.targetBytecodeVersion))
            return false;
        return true;
    }
}
