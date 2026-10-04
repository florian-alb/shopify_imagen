import { Download, RotateCcw } from "lucide-react";
import { PageHeader, pageContentClass } from "@/components/page";
import { Button } from "@/components/ui/button";
import { usePolicyGenerator } from "../hooks/usePolicyGenerator";
import { PolicyForm } from "./PolicyForm";
import { PolicyPreview } from "./PolicyPreview";
import { PolicyLanguageControls } from "./PolicyLanguageControls";

export function PolicyGeneratorPage() {
  const generator = usePolicyGenerator();
  const errorCount = Object.keys(generator.errors).length;
  return (
    <div className={pageContentClass}>
      <PageHeader
        title="Générateur de politiques"
        action={
          <>
            <Button variant="ghost" onClick={generator.reset}>
              <RotateCcw />
              Réinitialiser
            </Button>
            <Button
              variant="outline"
              onClick={() => generator.download(true)}
            >
              <Download />
              Télécharger les 6 documents
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.5fr)]">
        <div className="min-w-0 space-y-3">
          <PolicyLanguageControls language={generator.language} onLanguage={generator.setLanguage} />
          {generator.showErrors && errorCount > 0 && <p role="status" className="text-sm text-destructive">{errorCount} champ{errorCount > 1 ? "s" : ""} à corriger.</p>}
          <PolicyForm
            values={generator.values}
            errors={generator.errors}
            showErrors={generator.showErrors}
            onChange={generator.update}
            onValidate={() => generator.setShowErrors(true)}
            onProfile={generator.applyProfile}
          />
        </div>
        <PolicyPreview
          policies={generator.policies}
          selected={generator.selectedPolicy}
          activePolicy={generator.activePolicy}
          storeName={generator.values.storeName}
          onSelect={generator.setActivePolicy}
          onCopy={() => {
            void generator.copy();
          }}
          onDownload={() => generator.download()}
        />
      </div>
    </div>
  );
}
