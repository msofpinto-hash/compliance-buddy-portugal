import { PdfDataFixPanel } from "./PdfDataFixPanel";
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DuplicateCleanupPanel } from "./DuplicateCleanupPanel";
import { DataQualityPanel } from "./DataQualityPanel";

export function MaintenancePanel() {
  return (
    <div className="space-y-6">
      {/* URL Health - most important for data quality */}
      <UrlHealthPanel />

      {/* PDF Data Fix - for imported legislation */}
      <PdfDataFixPanel />

      {/* Data Quality Panel */}
      <DataQualityPanel />

      {/* Duplicate Cleanup */}
      <DuplicateCleanupPanel />
    </div>
  );
}
