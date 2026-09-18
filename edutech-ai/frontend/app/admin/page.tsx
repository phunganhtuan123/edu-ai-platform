import { redirect } from "next/navigation";

// "Quản trị" trên thanh điều hướng trỏ về /admin; trang mặc định là quản lý người dùng.
export default function AdminIndexPage() {
  redirect("/admin/users");
}
