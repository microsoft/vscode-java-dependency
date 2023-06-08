package com.microsoft.buildserver.adapter;

import java.util.Collections;
import java.util.List;

/**
 * The data used in 'build/initialize' request.
 */
public class BuildServerPreferences {
  private String gradleJavaHome;
  private String gradleVersion;
  private String gradleHome;
  private String gradleUserHome;
  private boolean gradleWrapperEnabled;
  private List<String> gradleArguments;
  private List<String> gradleJvmArguments;

  public BuildServerPreferences() {
    gradleArguments = Collections.emptyList();
    gradleJvmArguments = Collections.emptyList();
  }

  public String getGradleJavaHome() {
    return gradleJavaHome;
  }

  public void setGradleJavaHome(String gradleJavaHome) {
    this.gradleJavaHome = gradleJavaHome;
  }

  public String getGradleVersion() {
    return gradleVersion;
  }

  public void setGradleVersion(String gradleVersion) {
    this.gradleVersion = gradleVersion;
  }

  public String getGradleHome() {
    return gradleHome;
  }

  public void setGradleHome(String gradleHome) {
    this.gradleHome = gradleHome;
  }

  public String getGradleUserHome() {
    return gradleUserHome;
  }

  public void setGradleUserHome(String gradleUserHome) {
    this.gradleUserHome = gradleUserHome;
  }

  public boolean isGradleWrapperEnabled() {
    return gradleWrapperEnabled;
  }

  public void setGradleWrapperEnabled(boolean gradleWrapperEnabled) {
    this.gradleWrapperEnabled = gradleWrapperEnabled;
  }

  public List<String> getGradleArguments() {
    return gradleArguments;
  }

  public void setGradleArguments(List<String> gradleArguments) {
    this.gradleArguments = gradleArguments;
  }

  public List<String> getGradleJvmArguments() {
    return gradleJvmArguments;
  }

  public void setGradleJvmArguments(List<String> gradleJvmArguments) {
    this.gradleJvmArguments = gradleJvmArguments;
  }
}
