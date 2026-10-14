package xyz.jpenilla.squaremap.common.web;

import com.google.inject.Inject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.checkerframework.checker.nullness.qual.NonNull;
import org.checkerframework.framework.qual.DefaultQualifier;
import xyz.jpenilla.squaremap.common.Logging;
import xyz.jpenilla.squaremap.common.SquaremapDirectories;
import xyz.jpenilla.squaremap.common.config.Config;
import xyz.jpenilla.squaremap.common.util.FileUtil;

/**
 * Mirrors the externally-generated diplomacy source file (settings.diplomacy.source-file
 * in config.yml, written by whatever plugin owns nation/alliance/war data - e.g. a
 * Towny diplomacy plugin) into the web root as {@code diplomacy.json}, so it's served
 * as a normal static file alongside the map, wherever the source file actually lives
 * on disk.
 *
 * <p>Silently does nothing if diplomacy is disabled, no source file is configured, or
 * the configured source file doesn't exist yet (e.g. the owning plugin hasn't written
 * it on this boot cycle).</p>
 */
@DefaultQualifier(NonNull.class)
public final class UpdateDiplomacy implements Runnable {
    private final SquaremapDirectories directories;
    private long lastSourceModified = -1;

    @Inject
    private UpdateDiplomacy(final SquaremapDirectories directories) {
        this.directories = directories;
    }

    @Override
    public void run() {
        if (!Config.DIPLOMACY_ENABLED) {
            return;
        }

        final String configured = Config.DIPLOMACY_SOURCE_FILE;
        if (configured == null || configured.isBlank()) {
            return;
        }

        final Path source = Paths.get(configured);
        if (!Files.isRegularFile(source)) {
            Logging.debug(() -> "[diplomacy] source file does not exist (yet): " + source);
            return;
        }

        final long modified;
        try {
            modified = Files.getLastModifiedTime(source).toMillis();
        } catch (final IOException ex) {
            Logging.logger().warn("[diplomacy] could not stat source file '{}'", source, ex);
            return;
        }

        // Skip the copy if the source hasn't changed since we last mirrored it.
        if (modified == this.lastSourceModified) {
            return;
        }

        final Path destination = this.directories.webDirectory().resolve("diplomacy.json");

        try {
            FileUtil.atomicWrite(destination, tmp -> Files.copy(source, tmp, java.nio.file.StandardCopyOption.REPLACE_EXISTING));
            this.lastSourceModified = modified;
        } catch (final IOException ex) {
            Logging.logger().warn("[diplomacy] failed to copy '{}' to '{}'", source, destination, ex);
        }
    }
}
