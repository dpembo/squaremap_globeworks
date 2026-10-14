plugins {
  id("squaremap.publishing")
}

description = "API for extending squaremap, a minimalistic and lightweight world map viewer for Minecraft servers"

java {
  disableAutoTargetJvm()
}

dependencies {
  compileOnly(libs.paperApi)
  javadocLinks(libs.paperApi) {
    isTransitive = false
  }
  compileOnlyApi(libs.checkerQual)
  compileOnlyApi(platform(libs.adventureBom))
  compileOnlyApi(libs.adventureApi)
}

indra {
  javaVersions {
    target(25)
  }
}

tasks.withType(JavaCompile::class).configureEach {
  // Don't warn about missing forRemoval in @Deprecated
  options.compilerArgs.add("-Xlint:-classfile")
}

// Disable signing for local publishes (no key configured)
signing {
  setRequired { false }
}

tasks.withType<org.gradle.plugins.signing.Sign>().configureEach {
  onlyIf { false }
}

tasks.named<Jar>("javadocJar").configure {
  enabled = false
}