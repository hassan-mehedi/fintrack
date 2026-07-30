import { ImageResponse } from "next/og";

export const runtime = "edge";

const BRAND = "#17935f";
const BRAND_DARK = "#0f4f35";
const TEXT = "#f6fff8";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSize = Number(searchParams.get("size") ?? "512");
  const size = requestedSize === 192 ? 192 : 512;
  const padding = Math.round(size * 0.14);
  const logoSize = Math.round(size * 0.34);
  const wordmarkSize = Math.max(30, Math.round(size * 0.11));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${padding}px`,
          background:
            "linear-gradient(160deg, #17935f 0%, #12784d 55%, #0f4f35 100%)",
          color: TEXT,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            width: logoSize,
            height: logoSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: Math.round(size * 0.12),
            background: "rgba(255,255,255,0.18)",
            border: "1px solid rgba(255,255,255,0.22)",
            fontSize: Math.round(size * 0.18),
            fontWeight: 800,
          }}
        >
          F
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: Math.round(size * 0.19),
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            FinTrack
          </div>
          <div
            style={{
              marginTop: Math.round(size * 0.04),
              fontSize: wordmarkSize,
              lineHeight: 1.25,
              color: "rgba(246,255,248,0.85)",
            }}
          >
            Budgeting and expense tracking
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: Math.round(size * 0.45),
            height: Math.round(size * 0.45),
            borderBottomLeftRadius: Math.round(size * 0.24),
            background: `linear-gradient(180deg, rgba(255,255,255,0.16), ${BRAND_DARK})`,
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: Math.round(size * 0.14),
            right: padding,
            width: Math.round(size * 0.18),
            height: Math.round(size * 0.18),
            borderRadius: 9999,
            background: "rgba(255,255,255,0.12)",
            border: `1px solid ${BRAND}`,
          }}
        />
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
