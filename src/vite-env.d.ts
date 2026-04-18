/// <reference types="vite/client" />

declare module '*.module.css' {
  const styles: { readonly [key: string]: string }
  export default styles
}
