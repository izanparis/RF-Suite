import React from "react";
import { Github, Linkedin, Activity, FileDown, Cpu } from "lucide-react";

const AUTHOR_NAME = "Izan París Marcos";
const AUTHOR_ROLE = "Telecommunications Engineer";
const LINKEDIN_URL = "https://www.linkedin.com/in/izan-par%C3%ADs-marcos-6b1498388/";
const GITHUB_URL = "https://github.com/izanparis";
const AUTHOR_EMAIL = "izanparis@correo.ugr.es"; // opcional

const GRANASAT_NAME = "GranaSAT";
const GRANASAT_URL = "https://granasat.space";
const GRANASAT_LOGO_SRC = "/granasat.png"; // pon el logo en /public/granasat.png

async function openExternalUrl(url: string) {
  try {
    // We try to call the backend to open in system browser
    await fetch(`http://localhost:8080/api/utils/open-url?url=${encodeURIComponent(url)}`);
  } catch (e) {
    // Fallback: open in current window if backend fails
    window.open(url, "_blank");
  }
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 p-2 text-zinc-900 dark:text-zinc-100">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function GranaSatBadge() {
  return (
    <button
      onClick={() => openExternalUrl(GRANASAT_URL)}
      className="group inline-flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left"
      title={`Colaboración con ${GRANASAT_NAME}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white overflow-hidden">
        <img
          src={GRANASAT_LOGO_SRC}
          alt={`${GRANASAT_NAME} logo`}
          className="h-8 w-8 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="leading-tight">
        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">En colaboración con</div>
        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:underline">{GRANASAT_NAME}</div>
      </div>
    </button>
  );
}

export function Sobre() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">Sobre</div>
          <div className="mt-2 max-w-3xl text-base text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">RF Tool Suite Pro</span> es una aplicación web orientada a
            ingeniería RF / SI para acelerar flujos de trabajo de análisis, simulación y postprocesado con una interfaz
            moderna y consistente.
          </div>
        </div>
      </div>

      {/* Layout */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Author card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm lg:col-span-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Autor</div>

          <div className="mt-4">
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{AUTHOR_NAME}</div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{AUTHOR_ROLE}</div>

            {AUTHOR_EMAIL ? (
              <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                Contacto:{" "}
                <button 
                  onClick={() => openExternalUrl(`mailto:${AUTHOR_EMAIL}`)}
                  className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                >
                  {AUTHOR_EMAIL}
                </button>
              </div>
            ) : null}

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => openExternalUrl(LINKEDIN_URL)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                title="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn
              </button>

              <button
                onClick={() => openExternalUrl(GITHUB_URL)}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                title="GitHub"
              >
                <Github className="h-4 w-4" />
                GitHub
              </button>
            </div>

            {/* Colaboración SOLO aquí */}
            <div className="mt-6">
              <div className="mb-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">Colaboración</div>
              <GranaSatBadge />
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-100 dark:border-zinc-800 pt-4 text-xs text-zinc-500">
            © {new Date().getFullYear()} RF Tool Suite — All rights reserved.
          </div>
        </div>

        {/* Right: Project details */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Feature
              icon={<Activity className="h-5 w-5" />}
              title="Análisis rápido y consistente"
              desc="Interfaz unificada para ejecutar herramientas, comparar mediciones y obtener KPIs clave sin perder tiempo."
            />

            <Feature
              icon={<Cpu className="h-5 w-5" />}
              title="Backend Python"
              desc="Procesado numérico y rutinas RF en Python para asegurar trazabilidad y evolución futura."
            />

            <Feature
              icon={<FileDown className="h-5 w-5" />}
              title="Export profesional"
              desc="Resultados exportables (CSV/figuras/report) para documentación, revisión y replicación de estudios."
            />
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Objetivo del proyecto</div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Construir una suite modular de herramientas RF/SI donde cada “tool” sea fácilmente ampliable, con un
              diseño moderno y un flujo de trabajo que priorice la productividad: cargar → configurar → ejecutar →
              visualizar → exportar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
