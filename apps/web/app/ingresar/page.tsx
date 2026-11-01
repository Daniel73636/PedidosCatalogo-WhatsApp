"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function IngresarPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const session = await api<{ accessToken: string }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      localStorage.setItem("pedidos-access-token", session.accessToken);
      router.replace("/pedidos");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
      setBusy(false);
    }
  };
  return <main className="container section" style={{ maxWidth: 520 }}>
    <form className="card form" onSubmit={submit}>
      <div><div className="eyebrow">Panel del comercio</div><h1>Inicia sesión</h1></div>
      {error && <div className="banner" role="alert">{error}</div>}
      <div className="field"><label htmlFor="email">Correo</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <button className="btn big-btn" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</button>
    </form>
  </main>;
}
