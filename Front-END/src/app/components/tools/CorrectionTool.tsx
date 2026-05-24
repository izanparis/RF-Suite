import React, { useState, useRef } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Upload, FileCheck, Download, RefreshCw, CheckCircle2, AlertCircle, FlaskConical } from 'lucide-react';
import { cn } from '../ui/utils';

export function CorrectionTool() {
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [calFile, setCalFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const rawInputRef = useRef<HTMLInputElement>(null);
  const calInputRef = useRef<HTMLInputElement>(null);

  const handleCorrect = async () => {
    if (!rawFile || !calFile) {
      alert("Por favor selecciona ambos archivos: Medición RAW y Calibración JSON");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('raw_file', rawFile);
    formData.append('cal_file', calFile);

    try {
      const response = await fetch('http://localhost:8080/api/vna/hp/correct-offline', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let msg = "Error en el servidor";
        try {
          const errData = await response.json();
          msg = errData.detail || msg;
        } catch(e) {}
        throw new Error(msg);
      }

      const data = await response.json();
      
      if (data.status === "error") {
        setError(data.detail || "Error desconocido en la corrección.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadTouchstone = () => {
    if (!result?.touchstone_content) {
        alert("No hay contenido Touchstone para descargar.");
        return;
    }
    try {
        const blob = new Blob([result.touchstone_content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Determine correct extension from filename or default to .s1p/.s2p
        let filename = rawFile?.name || 'measurement';
        if (filename.includes('.')) {
            filename = filename.substring(0, filename.lastIndexOf('.'));
        }
        const ext = result.data?.has_s21 ? '.s2p' : '.s1p';
        
        a.download = `corrected_${filename}${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert("Error al generar la descarga local.");
    }
  };

  return (
    <ToolShell title="Corrección Offline S-Parameters" description="Aplica corrección vectorial a medidas RAW utilizando coeficientes de error de un VNA HP8752A.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Archivos de Entrada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Medición RAW (.s1p, .s2p)</Label>
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-4 transition-colors flex flex-col items-center justify-center cursor-pointer",
                    rawFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                  onClick={() => rawInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={rawInputRef} 
                    className="hidden" 
                    accept=".s1p,.s2p"
                    onChange={(e) => setRawFile(e.target.files?.[0] || null)}
                  />
                  {rawFile ? (
                    <div className="flex items-center gap-2 text-primary font-medium">
                      <FileCheck className="w-5 h-5" />
                      {rawFile.name}
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Haz clic para subir S11/S21 RAW</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Calibración HP JSON (.json)</Label>
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-4 transition-colors flex flex-col items-center justify-center cursor-pointer",
                    calFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                  onClick={() => calInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={calInputRef} 
                    className="hidden" 
                    accept=".json"
                    onChange={(e) => setCalFile(e.target.files?.[0] || null)}
                  />
                  {calFile ? (
                    <div className="flex items-center gap-2 text-primary font-medium">
                      <FileCheck className="w-5 h-5" />
                      {calFile.name}
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Haz clic para subir arrays de cal (.json)</p>
                    </div>
                  )}
                </div>
              </div>

              <Button 
                className="w-full mt-4" 
                onClick={handleCorrect}
                disabled={loading || !rawFile || !calFile}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Aplicar Corrección
              </Button>
            </CardContent>
          </Card>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <div className="text-sm">{error}</div>
            </div>
          )}
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {result ? (
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
                <div>
                  <CardTitle className="text-lg">Resultados</CardTitle>
                  <CardDescription>Corrección aplicada con éxito</CardDescription>
                </div>
                {result.touchstone_content && (
                  <Button variant="default" size="sm" onClick={downloadTouchstone} className="bg-green-600 hover:bg-green-700 text-white">
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Touchstone
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {result.plots && result.plots.map((plot: any) => (
                  <div key={plot.id} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{plot.title}</h4>
                    <img 
                      src={`data:image/png;base64,${plot.image}`} 
                      alt={plot.title}
                      className="w-full rounded-lg border border-border shadow-md"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-border rounded-xl opacity-50">
              {loading ? (
                <RefreshCw className="w-12 h-12 text-primary animate-spin mb-4" />
              ) : (
                <FlaskConical className="w-12 h-12 text-muted-foreground mb-4" />
              )}
              <p className="text-muted-foreground italic">
                {loading ? "Procesando corrección vectorial..." : "Sube los archivos y aplica la corrección para ver los resultados"}
              </p>
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
