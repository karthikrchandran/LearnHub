import { AdminAppShell } from "@/app/ui/learnhub-components";
import { getEnv } from "@/lib/env";
import {
  getMediaProviderReadiness,
  readinessText,
} from "@/modules/providers/media-provider-readiness";

import { getAdminWorkspace } from "../../../admin-utils";
import { uploadScormPackageFormAction } from "./actions";
import { ScormPackageUploadForm } from "./scorm-package-upload-form";

export const dynamic = "force-dynamic";

type ScormAdminPageProps = {
  params: Promise<{
    slug: string;
    courseSlug: string;
  }>;
};

export default async function ScormAdminPage({ params }: ScormAdminPageProps) {
  const { slug, courseSlug } = await params;
  const { organizationId, organizationName, prisma } = await getAdminWorkspace(slug);
  const readiness = getMediaProviderReadiness(getEnv());
  const course = await prisma.course.findFirst({
    where: {
      organizationId,
      slug: courseSlug,
      type: "SCORM_1_2",
    },
    select: {
      id: true,
      title: true,
      scormPackages: {
        where: { active: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          originalFileName: true,
          contentType: true,
          byteSize: true,
          storageKey: true,
          contentRootKey: true,
          launchPath: true,
          manifestTitle: true,
          extractionStatus: true,
          extractionError: true,
          malwareScanStatus: true,
          malwareScanError: true,
          updatedAt: true,
        },
      },
    },
  });
  const activePackage = course?.scormPackages[0] ?? null;
  const uploadPackageAction = async (formData: FormData) => {
    "use server";

    await uploadScormPackageFormAction(slug, courseSlug, formData);
  };
  const scormUploadUrl = `/api/org/${encodeURIComponent(slug)}/storage/upload`;

  if (!course) {
    return (
      <AdminAppShell organizationName={organizationName} slug={slug} active="scorm-packages">
        <div className="lh-main-inner">
          <header className="lh-main-head">
            <div>
              <p className="lh-eyebrow">SCORM package</p>
              <h1>{slug} / {courseSlug}</h1>
            </div>
          </header>
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-950">SCORM course not found</h2>
            <p className="mt-2 text-sm text-slate-600">Create or select a SCORM 1.2 course before editing package metadata.</p>
          </section>
        </div>
      </AdminAppShell>
    );
  }

  return (
    <AdminAppShell organizationName={organizationName} slug={slug} active="scorm-packages">
      <div className="lh-main-inner lh-main-wide">
        <header className="lh-main-head">
          <div>
            <p className="lh-eyebrow">SCORM package</p>
            <h1>{course.title}</h1>
            <p>
              {slug} / {courseSlug}
            </p>
          </div>
        </header>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">SCORM storage readiness</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">R2 storage</dt>
            <dd className="mt-1 text-slate-950">{readinessText(readiness.r2)}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">SCORM extraction job</dt>
            <dd className="mt-1 text-slate-950">{readinessText(readiness.scormExtraction)}</dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ScormPackageUploadForm
          action={uploadPackageAction}
          courseId={course.id}
          disabled={!readiness.r2.configured}
          disabledMessage={readinessText(readiness.r2)}
          packageId={`pkg_${course.id}`}
          uploadUrl={scormUploadUrl}
        />

        <aside className="rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Active package</h2>
          {activePackage ? (
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Upload zip</dt>
                <dd className="mt-1 break-words text-slate-950">{activePackage.storageKey}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">contentRootKey</dt>
                <dd className="mt-1 break-words text-slate-950">{activePackage.contentRootKey}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Launch path</dt>
                <dd className="mt-1 break-words text-slate-950">{activePackage.launchPath}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Manifest</dt>
                <dd className="mt-1 text-slate-950">{activePackage.manifestTitle ?? "Not recorded"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Extraction status</dt>
                <dd className="mt-1 text-slate-950">{activePackage.extractionStatus}</dd>
                {activePackage.extractionError ? <dd className="mt-1 text-xs text-red-700">{activePackage.extractionError}</dd> : null}
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="font-medium text-slate-500">Malware scan</dt>
                <dd className="mt-1 text-slate-950">{activePackage.malwareScanStatus}</dd>
                {activePackage.malwareScanError ? <dd className="mt-1 text-xs text-red-700">{activePackage.malwareScanError}</dd> : null}
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No SCORM package metadata saved yet.</p>
          )}
        </aside>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-950">Runtime tracking</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {["Lesson status", "Score", "Total time"].map((label) => (
            <div key={label} className="rounded-md bg-slate-50 p-3 text-sm font-medium text-slate-700">
              {label}
            </div>
          ))}
        </div>
      </section>
      </div>
    </AdminAppShell>
  );
}
