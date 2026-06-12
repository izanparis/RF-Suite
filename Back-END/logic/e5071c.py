"""
Driver for Agilent/Keysight E5071C ENA Network Analyzer.

Communicates via TCP/IP using pyvisa. Provides calibration (SOL / SOLT),
S-parameter measurement, calibration export/import, and instrument control.
"""

import numpy as np
import time
import logging
from typing import Optional, Dict, List, Tuple

try:
    import pyvisa
except ImportError:
    pyvisa = None

# Ruta de librería VISA Keysight (misma que usa HP8752A)
KEYSIGHT_VISA_PATH = r'C:\Program Files\IVI Foundation\VISA\Win64\ktvisa\ktbin\visa32.dll'


class E5071C:
    """Driver para el VNA Agilent/Keysight E5071C ENA."""

    # Caché a nivel de clase para el slot de calboard-izan para evitar búsquedas y pitidos repetidos
    _calkit_slot_cache = None

    def __init__(self, ip_address: str = "192.168.1.12"):
        if pyvisa is None:
            raise ImportError("pyvisa no instalado. Instálalo para usar el E5071C.")

        self.ip_address = ip_address
        self.inst = None
        self.connected = False
        self.device_type = "E5071C"
        self.channel = 1
        self._idn_info = {}

        # Priorizar la librería VISA nativa del sistema (Keysight/NI) que es la más robusta
        try:
            self.rm = pyvisa.ResourceManager()
            logging.info("Librería VISA nativa cargada correctamente.")
        except Exception as e:
            logging.warning(f"Error cargando VISA nativa: {e}. Intentando con Keysight VISA específica...")
            try:
                self.rm = pyvisa.ResourceManager(KEYSIGHT_VISA_PATH)
            except Exception:
                try:
                    self.rm = pyvisa.ResourceManager('@py')
                    logging.info("PyVISA-py cargado como fallback.")
                except Exception as e2:
                    raise ImportError(f"No se pudo cargar ningún ResourceManager de VISA: {e2}")

        resource_strings = [
            f'TCPIP::{ip_address}::INSTR',
            f'TCPIP::{ip_address}::5025::SOCKET'
        ]

        connected_successfully = False
        last_error = None

        for resource_string in resource_strings:
            try:
                logging.info(f"Intentando conectar al E5071C en {resource_string}...")
                self.inst = self.rm.open_resource(resource_string)
                self.inst.timeout = 30000  # 30s por defecto
                self.inst.read_termination = '\n'
                self.inst.write_termination = '\n'

                # Verificar conexión
                idn = self.inst.query('*IDN?').strip()
                parts = idn.split(',')
                self._idn_info = {
                    'manufacturer': parts[0] if len(parts) > 0 else 'Unknown',
                    'model': parts[1] if len(parts) > 1 else 'Unknown',
                    'serial': parts[2] if len(parts) > 2 else 'Unknown',
                    'firmware': parts[3] if len(parts) > 3 else 'Unknown',
                }
                self.connected = True
                connected_successfully = True
                logging.info(f"E5071C conectado exitosamente usando {resource_string}: {idn}")
                print(f"E5071C conectado en {resource_string}")
                print(f"  Fabricante: {self._idn_info['manufacturer']}")
                print(f"  Modelo: {self._idn_info['model']}")
                print(f"  S/N: {self._idn_info['serial']}")

                # Limpiar errores previos
                self.get_errors()

                # Activar pitidos del VNA para notificar fin de operaciones
                try:
                    self._write(':SYST:BEEP:COMP:STAT ON')
                    self._write(':SYST:BEEP:WARN:STAT ON')
                    logging.info("E5071C: Pitidos de operación y de advertencia activados.")
                    print("E5071C: Pitidos de operación y de advertencia activados.")
                except Exception as e:
                    logging.warning(f"No se pudo activar el beeper: {e}")
                break

            except Exception as e:
                last_error = e
                logging.warning(f"Fallo al conectar usando {resource_string}: {e}")
                if self.inst:
                    try:
                        self.inst.close()
                    except Exception:
                        pass
                    self.inst = None

        if not connected_successfully:
            logging.error(f"Error conectando al E5071C en {ip_address}: {last_error}")
            print(f"Error conectando al E5071C en {ip_address}: {last_error}")
            self.connected = False

    def close(self):
        """Cierra la conexión VISA."""
        if self.inst:
            try:
                self.inst.close()
            except Exception:
                pass
        self.connected = False

    def identify(self):
        """Devuelve información de identificación del instrumento."""
        return self._idn_info

    # ──────────────────────────────────────────────
    #  Utilidades internas
    # ──────────────────────────────────────────────

    def _write(self, cmd: str):
        """Escribe un comando SCPI."""
        if not self.connected or not self.inst:
            raise ConnectionError("E5071C desconectado")
        self.inst.write(cmd)

    def _query(self, cmd: str) -> str:
        """Envía un query SCPI y devuelve la respuesta."""
        if not self.connected or not self.inst:
            raise ConnectionError("E5071C desconectado")
        return self.inst.query(cmd).strip()

    def _write_wait(self, cmd: str, timeout_ms: int = 60000):
        """Escribe un comando y espera a que termine con *OPC?."""
        if not self.connected or not self.inst:
            raise ConnectionError("E5071C desconectado")
        orig_timeout = self.inst.timeout
        try:
            self.inst.timeout = timeout_ms
            self.inst.write(cmd)
            # Esperar a que el comando termine
            self._query('*OPC?')
        finally:
            self.inst.timeout = orig_timeout

    def _ch(self) -> str:
        """Devuelve el prefijo de canal para comandos SCPI."""
        return str(self.channel)

    def get_errors(self):
        """Lee y limpia la cola de errores del instrumento."""
        if not self.inst:
            return []
        errors = []
        try:
            for _ in range(50):  # Máximo 50 errores
                err = self._query(':SYST:ERR?')
                if err.startswith('+0') or err.startswith('0'):
                    break
                errors.append(err)
                logging.warning(f"E5071C Error: {err}")
        except Exception:
            pass
        return errors

    def _read_ieee_block(self) -> bytes:
        """
        Lee un bloque binario en formato IEEE 488.2 (#<digits><length><data>)
        desde el instrumento de forma robusta, compatible con TCPIP SOCKET e INSTR.
        """
        # 1. Leer el carácter de inicio '#'
        char = self.inst.read_bytes(1)
        if char != b'#':
            # Si no empieza por '#', tal vez vino algún carácter residual (ej: newline). Intentamos leer otro.
            if char in (b'\r', b'\n'):
                char = self.inst.read_bytes(1)
            if char != b'#':
                raise ValueError(f"Fallo al leer cabecera IEEE block: se esperaba '#', se obtuvo '{char}'")
        
        # 2. Leer el número de dígitos que representan la longitud
        digits_char = self.inst.read_bytes(1)
        num_digits = int(digits_char.decode('utf-8'))
        
        # 3. Leer los dígitos que indican el tamaño total en bytes
        len_bytes = self.inst.inst.read_bytes(num_digits) if hasattr(self.inst, 'inst') else self.inst.read_bytes(num_digits)
        total_length = int(len_bytes.decode('utf-8'))
        
        # 4. Leer exactamente esa cantidad de bytes
        data = self.inst.inst.read_bytes(total_length) if hasattr(self.inst, 'inst') else self.inst.read_bytes(total_length)
        
        # 5. Consumir el carácter de terminación si existe (usualmente un newline final)
        try:
            # Hacemos una lectura no bloqueante o con un pequeño timeout
            orig_timeout = self.inst.timeout
            self.inst.timeout = 500
            trail = self.inst.inst.read_bytes(1) if hasattr(self.inst, 'inst') else self.inst.read_bytes(1)
            if trail not in (b'\n', b'\r'):
                # Si no es terminación, lo ignoramos si no es relevante
                pass
        except Exception:
            pass
        finally:
            self.inst.timeout = orig_timeout
            
        # Reconstruir el bloque IEEE 488.2 completo para mantener compatibilidad
        header = f"#{num_digits}{total_length}".encode('utf-8')
        return header + data

    # ──────────────────────────────────────────────
    #  Configuración del barrido
    # ──────────────────────────────────────────────

    def set_sweep(self, start_hz: float, stop_hz: float, points: int):
        """Configura el rango de frecuencia y número de puntos."""
        if not self.connected:
            raise ConnectionError("E5071C desconectado")

        ch = self._ch()
        # Clamp a los límites del E5071C (100 kHz – 8.5 GHz)
        start_hz = max(100e3, min(start_hz, 8.5e9))
        stop_hz = max(100e3, min(stop_hz, 8.5e9))
        points = max(2, min(points, 20001))

        self._write(f':SENS{ch}:FREQ:STAR {start_hz}')
        self._write(f':SENS{ch}:FREQ:STOP {stop_hz}')
        self._write(f':SENS{ch}:SWE:POIN {points}')
        time.sleep(0.3)
        logging.info(f"E5071C sweep: {start_hz/1e6:.3f} – {stop_hz/1e6:.3f} MHz, {points} pts")

    def set_averaging(self, enabled: bool, count: int = 16):
        """Activa/desactiva averaging y configura el factor."""
        ch = self._ch()
        count = max(1, min(count, 999))
        self._write(f':SENS{ch}:AVER:COUN {count}')
        self._write(f':SENS{ch}:AVER {"ON" if enabled else "OFF"}')
        if enabled:
            self._write(f':SENS{ch}:AVER:CLE')  # Limpiar datos previos

    def set_smoothing(self, enabled: bool, aperture: float = 5.0):
        """Activa/desactiva smoothing y configura la apertura (% del span)."""
        ch = self._ch()
        aperture = max(0.05, min(aperture, 25.0))
        self._write(f':CALC{ch}:SMO:APER {aperture}')
        self._write(f':CALC{ch}:SMO:STAT {"ON" if enabled else "OFF"}')

    def set_sweep_type(self, typ: str = 'LIN'):
        """Establece el tipo de barrido: LIN, LOG, SEGM, POW."""
        ch = self._ch()
        typ = typ.upper()
        if typ not in ('LIN', 'LOG', 'SEGM', 'POW'):
            typ = 'LIN'
        self._write(f':SENS{ch}:SWE:TYPE {typ}')

    # ──────────────────────────────────────────────
    #  CalKit Selection by Name
    # ──────────────────────────────────────────────

    def select_calkit_by_name(self, name: str = "calboard-izan") -> bool:
        """
        Selecciona el kit de calibración en el VNA buscando por nombre.
        Utiliza el comando SCPI :SENS:CORR:COLL:CKIT:LABel? oficial.
        Optimizado con caché y accesos directos para evitar pitidos y esperas.
        """
        ch = self._ch()
        target_name = name.strip()
        search_targets = [target_name, "calboard-izan", "calizan", "User-sma", "calibrationboard-izan"]
        normalized_targets = [t.lower().replace('-', '').replace('_', '') for t in search_targets if t]

        # 1. Comprobar si el CalKit ACTIVO actualmente ya es compatible
        try:
            active_name = self._query(f':SENS{ch}:CORR:COLL:CKIT:LABel?').strip().strip('"').strip("'")
            active_normalized = active_name.lower().strip().replace('-', '').replace('_', '')
            if active_normalized in normalized_targets:
                print(f"E5071C: El CalKit activo en el VNA ya es '{active_name}' (compatible). Omitiendo selección.")
                return True
        except Exception as e:
            logging.warning(f"Error al verificar calkit activo: {e}")

        # 2. Comprobar si ya conocemos el slot por caché de clase
        if self.__class__._calkit_slot_cache is not None:
            cached_slot = self.__class__._calkit_slot_cache
            try:
                self._write(f':SENS{ch}:CORR:COLL:CKIT {cached_slot}')
                time.sleep(0.05)
                print(f"E5071C: Seleccionado slot {cached_slot} desde caché de clase.")
                return True
            except Exception as e:
                logging.warning(f"Error al aplicar slot desde caché: {e}")

        # 3. Probar los slots favoritos de forma directa (Slot 23 para 'calizan', Slot 22 para 'User-sma', Slot 13 para 'calboard-izan')
        favs = [23, 22, 13]
        for fav_slot in favs:
            try:
                self._write(f':SENS{ch}:CORR:COLL:CKIT {fav_slot}')
                time.sleep(0.05)
                slot_name = self._query(f':SENS{ch}:CORR:COLL:CKIT:LABel?').strip().strip('"').strip("'")
                s_normalized = slot_name.lower().strip().replace('-', '').replace('_', '')
                if s_normalized in normalized_targets:
                    self.__class__._calkit_slot_cache = fav_slot
                    print(f"E5071C: '{slot_name}' detectado directamente en el Slot Favorito {fav_slot} de forma exitosa.")
                    return True
            except Exception:
                try:
                    self._write('*CLS')
                except Exception:
                    pass

        # 4. Escaneo secuencial en reversa (de 30 a 1) para encontrar kits personalizados rápidamente con salida temprana
        try:
            orig_ckit = int(float(self._query(f':SENS{ch}:CORR:COLL:CKIT?')))
        except Exception:
            orig_ckit = 1

        print(f"E5071C: Iniciando escaneo secuencial en reversa (30 a 1) para buscar compatible con {search_targets}...")
        orig_timeout = self.inst.timeout
        found_slot = None
        matched_name = None
        
        try:
            self.inst.timeout = 800  # Timeout holgado para lectura segura
            for slot in range(30, 0, -1):
                try:
                    self._write(f':SENS{ch}:CORR:COLL:CKIT {slot}')
                    time.sleep(0.02)
                    slot_name = self._query(f':SENS{ch}:CORR:COLL:CKIT:LABel?').strip().strip('"').strip("'")
                    if slot_name:
                        print(f"  [Slot {slot}] Nombre en VNA: '{slot_name}'")
                        s_normalized = slot_name.lower().strip().replace('-', '').replace('_', '')
                        if s_normalized in normalized_targets:
                            found_slot = slot
                            matched_name = slot_name
                            break  # Salida temprana al encontrar coincidencia
                except Exception:
                    try:
                        self._write('*CLS')
                    except Exception:
                        pass
                    continue
        finally:
            self.inst.timeout = orig_timeout

        if found_slot is not None:
            try:
                self._write(f':SENS{ch}:CORR:COLL:CKIT {found_slot}')
                time.sleep(0.05)
                self.__class__._calkit_slot_cache = found_slot
                print(f"E5071C: CalKit '{matched_name}' seleccionado en slot {found_slot} tras escaneo secuencial.")
                return True
            except Exception as e:
                print(f"Error al seleccionar slot {found_slot}: {e}")

        # Si no se encuentra ninguno, restaurar original
        try:
            self._write(f':SENS{ch}:CORR:COLL:CKIT {orig_ckit}')
            time.sleep(0.05)
        except Exception:
            pass
            
        print(f"Advertencia: No se encontró ningún CalKit compatible con {search_targets}. Usando slot original {orig_ckit}.")
        return False

    # ──────────────────────────────────────────────
    #  Calibración SOL (1-port)
    # ──────────────────────────────────────────────

    def cal_sol_start(self, port: int = 1, calkit_name: str = "calboard-izan"):
        """Inicia calibración SOL (1-port) en el puerto indicado."""
        self.select_calkit_by_name(calkit_name)
        ch = self._ch()
        port = max(1, min(port, 4))
        logging.info(f"E5071C: Iniciando calibración SOL en puerto {port}")
        self._write_wait(f':SENS{ch}:CORR:COLL:METH:SOLT1 {port}', timeout_ms=30000)
        print(f"Calibración SOL iniciada en puerto {port}")

    # ──────────────────────────────────────────────
    #  Calibración SOLT (2-port)
    # ──────────────────────────────────────────────

    def cal_solt_start(self, port1: int = 1, port2: int = 2, calkit_name: str = "calboard-izan"):
        """Inicia calibración SOLT (2-port) en los puertos indicados."""
        self.select_calkit_by_name(calkit_name)
        ch = self._ch()
        port1 = max(1, min(port1, 4))
        port2 = max(1, min(port2, 4))
        if port1 == port2:
            raise ValueError("Los puertos para SOLT deben ser diferentes")
        logging.info(f"E5071C: Iniciando calibración SOLT en puertos {port1},{port2}")
        self._write_wait(f':SENS{ch}:CORR:COLL:METH:SOLT2 {port1},{port2}', timeout_ms=30000)
        print(f"Calibración SOLT iniciada en puertos {port1},{port2}")

    # ──────────────────────────────────────────────
    #  Pasos de calibración (compartidos SOL/SOLT)
    # ──────────────────────────────────────────────

    def cal_measure_standard(self, standard: str, port: int = 1):
        """
        Mide un estándar de calibración en el puerto indicado.
        standard: 'open', 'short', 'load'
        """
        ch = self._ch()
        port = max(1, min(port, 4))
        std_map = {
            'open': 'OPEN',
            'short': 'SHOR',
            'load': 'LOAD',
        }
        std_cmd = std_map.get(standard.lower())
        if not std_cmd:
            raise ValueError(f"Estándar no válido: {standard}. Use 'open', 'short' o 'load'.")

        logging.info(f"E5071C: Midiendo {standard.upper()} en puerto {port}")
        print(f"Midiendo {standard.upper()} en puerto {port}...")
        
        # Limpiar acumulador de averaging antes de medir para un promedio limpio
        try:
            averaging_enabled = self._query(f':SENS{ch}:AVER?').strip() == '1'
            if averaging_enabled:
                logging.info("E5071C: Limpiando acumulador de promedio (Averaging Clear) antes de la adquisición...")
                self._write(f':SENS{ch}:AVER:CLE')
        except Exception as e:
            logging.warning(f"Error al limpiar averaging: {e}")

        self._write_wait(f':SENS{ch}:CORR:COLL:{std_cmd} {port}', timeout_ms=300000)
        print(f"  {standard.upper()} puerto {port} completado.")
        
        # Emitir pitido de completado de operación
        try:
            self._write(':SYST:BEEP:COMP:IMM')
        except Exception as e:
            logging.warning(f"E5071C: Error al reproducir pitido de completado: {e}")

    def cal_measure_thru(self, port1: int = 1, port2: int = 2):
        """Mide el estándar THRU entre dos puertos en ambas direcciones."""
        ch = self._ch()
        port1 = max(1, min(port1, 4))
        port2 = max(1, min(port2, 4))
        logging.info(f"E5071C: Midiendo THRU entre puertos {port1},{port2}")
        print(f"Midiendo THRU entre puertos {port1} y {port2}...")
        
        # Limpiar acumulador de averaging antes de medir para un promedio limpio
        try:
            averaging_enabled = self._query(f':SENS{ch}:AVER?').strip() == '1'
            if averaging_enabled:
                logging.info("E5071C: Limpiando acumulador de promedio (Averaging Clear) antes de la adquisición de THRU...")
                self._write(f':SENS{ch}:AVER:CLE')
        except Exception as e:
            logging.warning(f"Error al limpiar averaging: {e}")

        # Medimos en ambas direcciones para registrar transmisión directa (Port1 -> Port2) y transmisión inversa (Port2 -> Port1)
        # Esto soluciona de raíz el error "Additional standard needed" del VNA.
        print(f"  Midiendo THRU {port1} -> {port2} (Directo)...")
        self._write_wait(f':SENS{ch}:CORR:COLL:THRU {port1},{port2}', timeout_ms=300000)
        try:
            self._write(':SYST:BEEP:COMP:IMM')
        except Exception:
            pass
        
        print(f"  Midiendo THRU {port2} -> {port1} (Inverso)...")
        self._write_wait(f':SENS{ch}:CORR:COLL:THRU {port2},{port1}', timeout_ms=300000)
        try:
            self._write(':SYST:BEEP:COMP:IMM')
        except Exception:
            pass
        
        print(f"  THRU {port1}-{port2} completado en ambas direcciones.")

    def cal_compute(self):
        """Calcula y aplica los coeficientes de corrección."""
        ch = self._ch()
        logging.info("E5071C: Calculando coeficientes de calibración...")
        print("Calculando coeficientes de calibración...")
        self._write_wait(f':SENS{ch}:CORR:COLL:SAVE', timeout_ms=300000)
        
        # Emitir pitido de completado de calibración total
        try:
            self._write(':SYST:BEEP:COMP:IMM')
        except Exception:
            pass

        # Verificar que la corrección está activa
        state = self._query(f':SENS{ch}:CORR:STAT?')
        if state.strip() != '1':
            self._write(f':SENS{ch}:CORR:STAT ON')
        print("Coeficientes calculados y corrección activada.")

    # ──────────────────────────────────────────────
    #  Medición de parámetros S
    # ──────────────────────────────────────────────

    def get_frequencies(self) -> np.ndarray:
        """Obtiene el array de frecuencias del barrido actual."""
        ch = self._ch()
        # Leer start, stop y points para reconstruir
        start = float(self._query(f':SENS{ch}:FREQ:STAR?'))
        stop = float(self._query(f':SENS{ch}:FREQ:STOP?'))
        points = int(float(self._query(f':SENS{ch}:SWE:POIN?')))
        return np.linspace(start, stop, points)

    def setup_traces_1port(self, port: int = 1):
        """Configura una traza para medición de 1-port (Spp)."""
        ch = self._ch()
        self._write(f':CALC{ch}:PAR:COUN 1')
        self._write(f':CALC{ch}:PAR1:SEL')
        self._write(f':CALC{ch}:PAR1:DEF S{port}{port}')
        self._write(f':CALC{ch}:TRAC1:FORM MLOG')
        time.sleep(0.2)

    def setup_traces_2port(self, port1: int = 1, port2: int = 2):
        """Configura 4 trazas para medición de 2-port completa."""
        ch = self._ch()
        self._write(f':CALC{ch}:PAR:COUN 4')
        time.sleep(0.1)

        params = [
            (1, f'S{port1}{port1}'),
            (2, f'S{port2}{port1}'),
            (3, f'S{port1}{port2}'),
            (4, f'S{port2}{port2}'),
        ]
        for trace_num, param in params:
            self._write(f':CALC{ch}:PAR{trace_num}:SEL')
            self._write(f':CALC{ch}:PAR{trace_num}:DEF {param}')
            self._write(f':CALC{ch}:TRAC{trace_num}:FORM MLOG')
        time.sleep(0.2)

    def trigger_single(self):
        """Ejecuta el disparador (respetando el averaging si está activo) y espera."""
        ch = self._ch()
        
        # Poner en modo de trigger manual
        self._write(f':INIT{ch}:CONT OFF')
        self._write(f':TRIG:SOUR BUS')
        time.sleep(0.1)

        # Detectar si averaging está activo
        averaging_enabled = False
        averaging_count = 1
        try:
            averaging_enabled = self._query(f':SENS{ch}:AVER?').strip() == '1'
            if averaging_enabled:
                averaging_count = int(float(self._query(f':SENS{ch}:AVER:COUN?')))
        except Exception as e:
            print(f"Error querying averaging status: {e}")

        if averaging_enabled and averaging_count > 1:
            print(f"E5071C: Averaging activo (Count={averaging_count}). Ejecutando barrido de estabilización...")
            self._write(f':SENS{ch}:AVER:CLE')
            for i in range(averaging_count):
                self._write_wait(f':TRIG:SING', timeout_ms=60000)
        else:
            self._write_wait(f':TRIG:SING', timeout_ms=60000)

        # Emitir pitido de fin de barrido / medición
        try:
            self._write(':SYST:BEEP:COMP:IMM')
        except Exception as e:
            logging.warning(f"E5071C: Error al reproducir pitido de fin de barrido: {e}")

    def _read_sdata(self, trace: int = 1) -> np.ndarray:
        """
        Lee los datos S complejos (SDAT) de una traza.
        Devuelve array de complejos.
        """
        ch = self._ch()
        self._write(f':CALC{ch}:PAR{trace}:SEL')
        time.sleep(0.05)

        orig_timeout = self.inst.timeout
        try:
            self.inst.timeout = 30000
            raw = self._query(f':CALC{ch}:TRAC{trace}:DATA:SDAT?')
        finally:
            self.inst.timeout = orig_timeout

        values = [float(v) for v in raw.split(',')]
        # SDAT devuelve pares Re,Im
        real_parts = np.array(values[0::2])
        imag_parts = np.array(values[1::2])
        return real_parts + 1j * imag_parts

    def get_data(self, parameter: str = "S11") -> Tuple[np.ndarray, np.ndarray]:
        """
        Obtiene frecuencias y datos complejos para un parámetro S.
        Configura la traza, hace un barrido y lee los datos.
        """
        if not self.connected or not self.inst:
            raise ConnectionError("E5071C desconectado")

        ch = self._ch()
        # Configurar una traza con el parámetro pedido
        self._write(f':CALC{ch}:PAR:COUN 1')
        self._write(f':CALC{ch}:PAR1:SEL')
        self._write(f':CALC{ch}:PAR1:DEF {parameter.upper()}')
        time.sleep(0.2)

        # Disparar barrido
        self.trigger_single()

        # Leer frecuencias y datos
        freqs = self.get_frequencies()
        sdata = self._read_sdata(trace=1)

        # Ajustar longitudes si difieren
        min_len = min(len(freqs), len(sdata))
        freqs = freqs[:min_len]
        sdata = sdata[:min_len]

        # Restaurar trigger continuo e interno
        self._write(f':INIT{ch}:CONT ON')
        self._write(':TRIG:SOUR INT')

        return freqs, sdata

    def stream(self, parameter: str = "S11"):
        """
        Interfaz compatible con process_sweep() de vna.py.
        Yield (s11_data, s21_data, frequencies).
        """
        if not self.connected or not self.inst:
            raise ConnectionError("E5071C desconectado")

        ch = self._ch()

        # Determinar si es medición de 1 o 2 puertos según el parámetro
        param_upper = parameter.upper()

        # Configurar trazas
        self._write(f':CALC{ch}:PAR:COUN 2')
        time.sleep(0.1)
        self._write(f':CALC{ch}:PAR1:SEL')
        self._write(f':CALC{ch}:PAR1:DEF S11')
        self._write(f':CALC{ch}:PAR2:SEL')
        self._write(f':CALC{ch}:PAR2:DEF S21')
        time.sleep(0.2)

        # Disparar barrido
        self.trigger_single()

        # Leer datos
        freqs = self.get_frequencies()
        s11 = self._read_sdata(trace=1)
        s21 = self._read_sdata(trace=2)

        # Ajustar longitudes
        min_len = min(len(freqs), len(s11), len(s21))
        freqs = freqs[:min_len]
        s11 = s11[:min_len]
        s21 = s21[:min_len]

        # Restaurar trigger continuo e interno
        self._write(f':INIT{ch}:CONT ON')
        self._write(':TRIG:SOUR INT')

        if param_upper == "S11":
            yield s11, s21, freqs
        else:
            yield s11, s21, freqs

    # ──────────────────────────────────────────────
    #  Medición de parámetros S completos (para .s2p)
    # ──────────────────────────────────────────────

    def measure_full_2port(self, port1: int = 1, port2: int = 2):
        """
        Mide los 4 parámetros S completos para generar un .s2p.
        Devuelve (freqs, s11, s21, s12, s22).
        """
        ch = self._ch()

        # Configurar 4 trazas
        self.setup_traces_2port(port1, port2)

        # Disparar barrido
        self.trigger_single()

        # Leer datos
        freqs = self.get_frequencies()
        s11 = self._read_sdata(trace=1)
        s21 = self._read_sdata(trace=2)
        s12 = self._read_sdata(trace=3)
        s22 = self._read_sdata(trace=4)

        # Restaurar trigger continuo e interno
        self._write(f':INIT{ch}:CONT ON')
        self._write(':TRIG:SOUR INT')

        min_len = min(len(freqs), len(s11), len(s21), len(s12), len(s22))
        return (
            freqs[:min_len],
            s11[:min_len],
            s21[:min_len],
            s12[:min_len],
            s22[:min_len],
        )

    # ──────────────────────────────────────────────
    #  Export / Import de calibración
    # ──────────────────────────────────────────────

    def export_cal_json(self) -> Optional[Dict]:
        """
        Exporta el estado de calibración actual como diccionario JSON.
        Guarda el estado del instrumento en un archivo temporal en su disco,
        luego lee los parámetros de barrido.
        """
        if not self.connected or not self.inst:
            return None

        ch = self._ch()

        # Verificar si hay corrección activa
        try:
            corr_state = self._query(f':SENS{ch}:CORR:STAT?')
            if corr_state.strip() != '1':
                print("No hay corrección activa para exportar.")
                logging.warning("E5071C: No hay corrección activa")
        except Exception:
            pass

        state = {
            "vna_model": "E5071C",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "ip_address": self.ip_address,
        }

        try:
            state["start_hz"] = float(self._query(f':SENS{ch}:FREQ:STAR?'))
            state["stop_hz"] = float(self._query(f':SENS{ch}:FREQ:STOP?'))
            state["points"] = int(float(self._query(f':SENS{ch}:SWE:POIN?')))
            state["sweep_type"] = self._query(f':SENS{ch}:SWE:TYPE?').strip()

            # Averaging
            state["averaging_on"] = self._query(f':SENS{ch}:AVER?').strip() == '1'
            state["averaging_count"] = int(float(self._query(f':SENS{ch}:AVER:COUN?')))

            # Smoothing
            state["smoothing_on"] = self._query(f':CALC{ch}:SMO:STAT?').strip() == '1'
            state["smoothing_aperture"] = float(self._query(f':CALC{ch}:SMO:APER?'))

            # Guardar estado completo al disco del instrumento
            state_filename = 'D:/RF_TOOL_SUITE_CAL_EXPORT.sta'
            self._write(f':MMEM:STOR "{state_filename}"')
            time.sleep(2.0)

            # Leer el archivo guardado desde el instrumento
            orig_timeout = self.inst.timeout
            orig_read_term = self.inst.read_termination
            try:
                self.inst.timeout = 30000
                self.inst.read_termination = None
                self._write(f':MMEM:TRAN? "{state_filename}"')
                # Usar lector de bloques IEEE robusto y libre de timeouts
                raw_data = self._read_ieee_block()
                import base64
                state["state_file_b64"] = base64.b64encode(raw_data).decode('utf-8')
                state["state_filename"] = state_filename
            except Exception as e:
                logging.warning(f"No se pudo leer el archivo de estado binario: {e}")
                # Fallback: guardamos solo los parámetros de sweep
                state["state_file_b64"] = None
            finally:
                self.inst.timeout = orig_timeout
                self.inst.read_termination = orig_read_term

            # Limpiar archivo temporal del instrumento
            try:
                self._write(f':MMEM:DEL "{state_filename}"')
            except Exception:
                pass

            # Leer trazas activas y sus parámetros
            num_traces = int(float(self._query(f':CALC{ch}:PAR:COUN?')))
            traces = []
            for t in range(1, min(num_traces + 1, 17)):
                try:
                    self._write(f':CALC{ch}:PAR{t}:SEL')
                    param = self._query(f':CALC{ch}:PAR{t}:DEF?').strip().strip('"')
                    traces.append(param)
                except Exception:
                    break
            state["traces"] = traces
            state["correction_active"] = self._query(f':SENS{ch}:CORR:STAT?').strip() == '1'

            return state

        except Exception as e:
            logging.error(f"Error exportando calibración E5071C: {e}")
            print(f"Error exportando calibración: {e}")
            return None

    def import_cal_json(self, state: Dict) -> bool:
        """
        Importa un estado de calibración previamente exportado.
        """
        if not self.connected or not self.inst:
            return False

        ch = self._ch()
        print(f"Restaurando calibración E5071C...")

        try:
            # Restaurar parámetros de barrido
            if "start_hz" in state:
                self.set_sweep(state["start_hz"], state["stop_hz"], state["points"])

            # Restaurar averaging
            if "averaging_on" in state:
                self.set_averaging(state["averaging_on"], state.get("averaging_count", 16))

            # Restaurar smoothing
            if "smoothing_on" in state:
                self.set_smoothing(state["smoothing_on"], state.get("smoothing_aperture", 5.0))

            # Restaurar sweep type
            if "sweep_type" in state:
                self.set_sweep_type(state["sweep_type"])

            # Restaurar archivo de estado si existe
            state_b64 = state.get("state_file_b64")
            if state_b64:
                import base64
                raw_data = base64.b64decode(state_b64)
                state_filename = state.get("state_filename", "D:/RF_TOOL_SUITE_CAL_IMPORT.sta")

                # Escribir archivo al instrumento
                orig_timeout = self.inst.timeout
                try:
                    self.inst.timeout = 30000
                    cmd = f':MMEM:TRAN "{state_filename}",'.encode('utf-8')
                    self.inst.write_raw(cmd + raw_data)
                    time.sleep(1.0)

                    # Cargar estado
                    self._write(f':MMEM:LOAD:STAT "{state_filename}"')
                    time.sleep(2.0)
                except Exception as e:
                    logging.warning(f"No se pudo restaurar archivo de estado: {e}")
                    # Fallback: al menos los parámetros de sweep ya están configurados
                finally:
                    self.inst.timeout = orig_timeout

                # Limpiar archivo temporal
                try:
                    self._write(f':MMEM:DEL "{state_filename}"')
                except Exception:
                    pass

            # Activar corrección
            self._write(f':SENS{ch}:CORR:STAT ON')
            time.sleep(0.5)

            print("Calibración restaurada correctamente.")
            return True

        except Exception as e:
            logging.error(f"Error importando calibración E5071C: {e}")
            print(f"Error importando calibración: {e}")
            return False

    # ──────────────────────────────────────────────
    #  Touchstone file save/export
    # ──────────────────────────────────────────────

    def set_snp_format(self, fmt: str = 'RI'):
        """Establece formato de datos Touchstone: AUTO, MA, DB, RI."""
        fmt = fmt.upper()
        if fmt not in ('AUTO', 'MA', 'DB', 'RI'):
            fmt = 'RI'
        self._write(f':MMEM:STOR:SNP:FORM {fmt}')

    def set_snp_1port(self, port: int = 1):
        """Establece el puerto para archivo .s1p."""
        self._write(f':MMEM:STOR:SNP:TYPE:S1P {port}')

    def set_snp_2port(self, port1: int = 1, port2: int = 2):
        """Establece los puertos para archivo .s2p."""
        self._write(f':MMEM:STOR:SNP:TYPE:S2P {port1},{port2}')

    # ──────────────────────────────────────────────
    #  Reset
    # ──────────────────────────────────────────────

    def reset_instrument(self):
        """Reinicia el instrumento a valores de fábrica."""
        logging.info("E5071C: Reset del instrumento")
        print("Reiniciando E5071C...")
        self._write('*RST')
        time.sleep(3.0)
        self._write('*CLS')  # Limpiar status
        time.sleep(0.5)
        # Volver a activar pitidos tras reset
        try:
            self._write(':SYST:BEEP:COMP:STAT ON')
            self._write(':SYST:BEEP:WARN:STAT ON')
        except Exception:
            pass
        self.get_errors()
        print("E5071C reiniciado.")

    def preset(self):
        """Ejecuta preset del sistema (más suave que *RST)."""
        self._write(':SYST:PRES')
        time.sleep(2.0)
        # Volver a activar pitidos tras preset
        try:
            self._write(':SYST:BEEP:COMP:STAT ON')
            self._write(':SYST:BEEP:WARN:STAT ON')
        except Exception:
            pass
        self.get_errors()

    # ──────────────────────────────────────────────
    #  Compatibilidad con la interfaz HP8752A
    # ──────────────────────────────────────────────

    def hp_measurement_step(self, step_name: str, params: Optional[Dict] = None):
        """Interfaz compatible con HP8752A para pasos de medición."""
        if not self.connected:
            return "Disconnected"

        if step_name == "setup":
            self.set_sweep(
                params.get('start_hz', 100e3),
                params.get('stop_hz', 8.5e9),
                params.get('points', 201)
            )
            param = params.get('parameter', 'S11')
            self.get_data(param)  # Configura la traza
            return "OK"
        elif step_name == "measure":
            self.trigger_single()
            return "OK"
        elif step_name == "download":
            freqs, data = self.get_data(params.get('parameter', 'S11'))
            return {
                "freqs": freqs.tolist(),
                "real": np.real(data).tolist(),
                "imag": np.imag(data).tolist()
            }
        return "Unknown"
