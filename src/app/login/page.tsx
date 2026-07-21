import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Link href="/" className="brand-mark">
          명패
        </Link>
        <h1>운영자 로그인</h1>
        <p className="auth-lead">JWT로 인증되며, 발급 토큰은 장기 유지됩니다.</p>
        <LoginForm />
      </div>
    </main>
  );
}
