import {
  extractScormZip,
  type MalwareScanner,
  type ScormExtractionWriter,
} from "./scorm-extraction";

export type ScormPackageJobPackage = {
  id: string;
  organizationId: string;
  courseId: string;
  storageKey: string;
  contentRootKey: string;
};

export type ScormPackageJobRepository = {
  claimNextPendingPackage(): Promise<ScormPackageJobPackage | null>;
  markExtractionProcessing(packageId: string): Promise<void>;
  markMalwareScanStatus(input: {
    packageId: string;
    status: "PENDING" | "PASSED" | "FAILED";
    error: string | null;
  }): Promise<void>;
  markExtractionReady(input: {
    packageId: string;
    manifestTitle: string | null;
    launchPath: string;
    extractedFileCount: number;
  }): Promise<void>;
  markExtractionFailed(input: {
    packageId: string;
    error: string;
  }): Promise<void>;
};

export type ScormPackageJobStorage = ScormExtractionWriter & {
  getObjectBytes(key: string): Promise<Uint8Array>;
};

export type ProcessScormExtractionJobResult =
  | { status: "processed"; packageId: string }
  | { status: "blocked"; packageId: string }
  | { status: "failed"; packageId: string }
  | { status: "skipped" };

export async function processNextScormExtractionJob(input: {
  repository: ScormPackageJobRepository;
  storage: ScormPackageJobStorage;
  scanner: MalwareScanner;
}): Promise<ProcessScormExtractionJobResult> {
  const scormPackage = await input.repository.claimNextPendingPackage();

  if (!scormPackage) {
    return { status: "skipped" };
  }

  await input.repository.markExtractionProcessing(scormPackage.id);

  try {
    const zipBytes = await input.storage.getObjectBytes(scormPackage.storageKey);
    const result = await extractScormZip({
      organizationId: scormPackage.organizationId,
      courseId: scormPackage.courseId,
      packageId: scormPackage.id,
      contentRootKey: scormPackage.contentRootKey,
      zipBytes,
      scanner: input.scanner,
      writer: input.storage,
    });

    if (result.status === "blocked") {
      await input.repository.markMalwareScanStatus({
        packageId: scormPackage.id,
        status: "FAILED",
        error: result.malwareScanError,
      });
      await input.repository.markExtractionFailed({
        packageId: scormPackage.id,
        error: result.malwareScanError,
      });

      return { status: "blocked", packageId: scormPackage.id };
    }

    await input.repository.markMalwareScanStatus({
      packageId: scormPackage.id,
      status: result.malwareScanStatus,
      error: null,
    });
    await input.repository.markExtractionReady({
      packageId: scormPackage.id,
      manifestTitle: result.manifestTitle,
      launchPath: result.launchPath,
      extractedFileCount: result.extractedKeys.length,
    });

    return { status: "processed", packageId: scormPackage.id };
  } catch (error) {
    await input.repository.markExtractionFailed({
      packageId: scormPackage.id,
      error: error instanceof Error ? error.message : "SCORM extraction failed",
    });

    return { status: "failed", packageId: scormPackage.id };
  }
}
