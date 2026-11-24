/** 밖으로 나가는 링크 표시. 기사 버튼(시안 S3, 2026-11-24) */
export default function ExternalIcon() {
  return (
    <svg className="ext-ico" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M5 2H2v8h8V7" />
      <path className="ext-ico-arrow" d="M7 1.5h3.5V5M10.5 1.5 5.5 6.5" />
    </svg>
  );
}
