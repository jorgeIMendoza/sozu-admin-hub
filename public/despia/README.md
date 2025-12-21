# Despia Native App Assets

Este directorio contiene los assets necesarios para compilar la app nativa con Despia.

## Archivos Requeridos

### 1. App Icon (`app-icon-1024.png`)
- **Tamaño**: 1024x1024 píxeles
- **Formato**: PNG
- **Requisitos**:
  - Sin transparencia (fondo sólido)
  - Sin bordes redondeados (iOS los aplica automáticamente)
  - Colores vibrantes y legibles a tamaños pequeños
  - Se recomienda usar el logo SOZU con fondo verde (#2e9a6d)

### 2. Splash Screen (`splash-screen.gif`)
- **Tamaño**: 1024x1024 píxeles (se escalará automáticamente)
- **Formato**: GIF animado o PNG estático
- **Requisitos**:
  - Fondo transparente o del color de la app
  - Logo SOZU centrado
  - Animación sutil recomendada (fade in, pulse, etc.)
  - Duración máxima: 2-3 segundos

## Cómo Reemplazar los Assets

1. Crea tu icono de 1024x1024px y nómbralo `app-icon-1024.png`
2. Crea tu splash screen y nómbralo `splash-screen.gif` (o `.png` si es estático)
3. Sube los archivos a esta carpeta (`public/despia/`)
4. Actualiza `despia.config.json` si cambias los nombres de archivo

## Herramientas Recomendadas

- **Iconos**: Figma, Sketch, Adobe Illustrator
- **GIF animados**: Adobe After Effects, Lottie, o herramientas online como Canva
- **Redimensionado**: https://makeappicon.com para generar todos los tamaños

## Notas Importantes

⚠️ Los placeholders actuales son solo de referencia. **Debes reemplazarlos** con tus assets finales antes de compilar en Despia.

Para más información, visita: https://docs.despia.com/assets
