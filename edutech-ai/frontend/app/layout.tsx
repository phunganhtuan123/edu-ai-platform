import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduTech AI",
  description:
    "Trợ lý AI tiếng Việt cho giáo viên: giáo án điện tử, sơ đồ tư duy, trắc nghiệm, đề thi, chấm bài viết, hoạt động tương tác.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
