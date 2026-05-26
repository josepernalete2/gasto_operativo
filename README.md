# Control de Gastos Operativos | Dashboard Corporativo

Dashboard interactivo y responsivo de control de egresos para empresas privadas, diseñado para monitorear gastos operativos en tiempo real distribuidos en múltiples sedes.

## 🚀 Características

- **Visualización en Tiempo Real**: Panel analítico con indicadores clave de rendimiento (KPIs) y gráficos interactivos (desglose por sede, clasificación por categorías y estado de pagos).
- **Tabla Editable In-Line**: Permite modificar la fecha, sede, categoría, descripción, monto y estado directamente desde la fila con doble clic o presionando el botón "Editar".
- **Gestión Dinámica de Parámetros**: Módulo de configuración para añadir, renombrar (en cascada actualizando el historial) y eliminar sedes o categorías, con validación de integridad referencial.
- **Módulo de Impresión**: Layout optimizado para impresión ejecutiva (Landscape) con inyección de filtros activos y líneas de firma para control financiero.
- **Modo Claro / Modo Oscuro**: Tema de color adaptable que actualiza automáticamente el contraste de la interfaz y de los gráficos de Chart.js.
- **Persistencia Local**: Todos los datos se sincronizan y persisten automáticamente en el navegador a través de `LocalStorage`.

## 🛠️ Tecnologías Utilizadas

- **HTML5** (Semántico)
- **CSS3** (Variables personalizadas, Flexbox, Grid y Animaciones nativas)
- **JavaScript Vanilla** (ES6+, manipulación del DOM y manejo de estado reactivo)
- **Chart.js** (Gráficos interactivos vía CDN)
- **Lucide Icons** (Iconografía vía CDN)

## 💻 Instrucciones de Uso Local

1. Clona este repositorio o descarga los archivos.
2. Abre el archivo `index.html` directamente en tu navegador habitual, o bien levanta un servidor local:
   ```bash
   # Utilizando Python
   python -m http.server 3000
   
   # O utilizando Node.js
   npx http-server -p 3000
   ```
3. Navega a `http://localhost:3000` en tu explorador.
