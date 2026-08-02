import { AlertStrip } from "@/components/ui/dashboard/AlertStrip";
import { RESTRICTED_DATA_BANNER_TEXT } from "./constants";

export { RESTRICTED_DATA_BANNER_TEXT };

export function RestrictedDataBanner() {
  return (
    <div role="status" data-component="RestrictedDataBanner">
      <AlertStrip
        variant="warning"
        icon={
          <span aria-hidden="true" style={{ fontSize: 14 }}>
            🔒
          </span>
        }
      >
        {RESTRICTED_DATA_BANNER_TEXT}
      </AlertStrip>
    </div>
  );
}

export default RestrictedDataBanner;
