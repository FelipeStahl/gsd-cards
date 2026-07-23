import { useTranslation } from "react-i18next";

function App() {
  const { t } = useTranslation("common");

  return (
    <main
      style={{
        backgroundColor: "var(--color-dominant)",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          fontSize: "var(--font-size-display)",
          lineHeight: "var(--line-height-display)",
          fontWeight: "var(--font-weight-display)",
          fontFamily: "var(--font-family-sans)",
          margin: 0,
          padding: "var(--spacing-lg)",
        }}
      >
        {t("app.title")}
      </h1>
    </main>
  );
}

export default App;
