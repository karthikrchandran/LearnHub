import type { CSSProperties } from "react";

export type CertificateViewModel = {
  verificationCode: string;
  verificationUrl: string;
  learnerName: string;
  courseTitle: string;
  issuedAt: Date;
  issuerName: string;
  issuerLogoUrl: string | null;
  issuerPrimaryColor: string;
  issuerAccentColor: string;
};

export function CertificateRenderer({ certificate }: { certificate: CertificateViewModel }) {
  const issuedDate = certificate.issuedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <article
      className="certificate-artifact"
      style={
        {
          "--issuer-primary": certificate.issuerPrimaryColor,
          "--issuer-accent": certificate.issuerAccentColor,
        } as CSSProperties
      }
    >
      <style>{certificateStyles}</style>
      <header className="certificate-header">
        {certificate.issuerLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Downloadable certificate HTML cannot depend on next/image.
          <img className="certificate-logo" src={certificate.issuerLogoUrl} alt={`${certificate.issuerName} logo`} />
        ) : null}
        <div>
          <p className="certificate-eyebrow">Certificate of completion</p>
          <h1>{certificate.courseTitle}</h1>
        </div>
      </header>
      <section className="certificate-body">
        <p>This certificate verifies that</p>
        <h2>{certificate.learnerName}</h2>
        <p>completed {certificate.courseTitle} on {issuedDate}.</p>
      </section>
      <footer className="certificate-footer">
        <div>
          <p className="certificate-label">Issued by</p>
          <p>{certificate.issuerName}</p>
        </div>
        <div>
          <p className="certificate-label">Verification code</p>
          <p>{certificate.verificationCode}</p>
        </div>
        <div>
          <p className="certificate-label">Verification URL</p>
          <p>{certificate.verificationUrl}</p>
        </div>
      </footer>
    </article>
  );
}

export function renderCertificateArtifact(certificate: CertificateViewModel): string {
  const issuedDate = certificate.issuedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const logo = certificate.issuerLogoUrl
    ? `<img class="certificate-logo" src="${escapeAttribute(certificate.issuerLogoUrl)}" alt="${escapeAttribute(certificate.issuerName)} logo">`
    : "";
  const markup = `<article class="certificate-artifact" style="--issuer-primary: ${escapeAttribute(certificate.issuerPrimaryColor)}; --issuer-accent: ${escapeAttribute(certificate.issuerAccentColor)};"><style>${certificateStyles}</style><header class="certificate-header">${logo}<div><p class="certificate-eyebrow">Certificate of completion</p><h1>${escapeHtml(certificate.courseTitle)}</h1></div></header><section class="certificate-body"><p>This certificate verifies that</p><h2>${escapeHtml(certificate.learnerName)}</h2><p>completed ${escapeHtml(certificate.courseTitle)} on ${escapeHtml(issuedDate)}.</p></section><footer class="certificate-footer"><div><p class="certificate-label">Issued by</p><p>${escapeHtml(certificate.issuerName)}</p></div><div><p class="certificate-label">Verification code</p><p>${escapeHtml(certificate.verificationCode)}</p></div><div><p class="certificate-label">Verification URL</p><p>${escapeHtml(certificate.verificationUrl)}</p></div></footer></article>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(certificate.courseTitle)} certificate</title></head><body>${markup}</body></html>`;
}

const certificateStyles = `
  .certificate-artifact {
    border: 6px solid var(--issuer-primary);
    color: #0f172a;
    display: flex;
    flex-direction: column;
    gap: 48px;
    margin: 0 auto;
    max-width: 960px;
    min-height: 640px;
    padding: 56px;
    font-family: Arial, Helvetica, sans-serif;
  }
  .certificate-header {
    align-items: center;
    border-bottom: 3px solid var(--issuer-accent);
    display: flex;
    gap: 24px;
    padding-bottom: 24px;
  }
  .certificate-logo {
    height: 72px;
    max-width: 180px;
    object-fit: contain;
  }
  .certificate-eyebrow,
  .certificate-label {
    color: var(--issuer-primary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    margin: 0 0 8px;
    text-transform: uppercase;
  }
  .certificate-artifact h1 {
    font-size: 40px;
    margin: 0;
  }
  .certificate-body {
    flex: 1;
    text-align: center;
  }
  .certificate-body p {
    font-size: 20px;
    margin: 12px 0;
  }
  .certificate-body h2 {
    color: var(--issuer-primary);
    font-size: 54px;
    margin: 18px 0;
  }
  .certificate-footer {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .certificate-footer p {
    overflow-wrap: anywhere;
    margin: 0;
  }
  @media print {
    body {
      margin: 0;
    }
    .certificate-artifact {
      border-width: 4px;
      box-sizing: border-box;
      min-height: 100vh;
      width: 100%;
    }
  }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
