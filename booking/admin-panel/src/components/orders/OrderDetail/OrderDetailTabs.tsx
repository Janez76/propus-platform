import { TabsList, TabsTrigger } from "../../ui/tabs";
import { t, type Lang } from "../../../i18n";

type Props = {
  lang: Lang;
};

/**
 * Tab-Navigation fuer die OrderDetail-Ansicht.
 *
 * Muss innerhalb eines `<Tabs>`-Root gerendert werden; die `<TabsContent>`
 * Bloecke bleiben im Orchestrator (`OrderDetail/index.tsx`), weil sie
 * starken Zugriff auf den dortigen Form-State und Per-Card-Inline-Edit
 * haben. Diese Komponente kapselt nur die Tab-Header (Triggers) –
 * konsistent mit dem Shadcn-Pattern, wo `<TabsList>` und `<TabsContent>`
 * unabhaengige Kinder von `<Tabs>` sind und ueber den gemeinsamen
 * `value` kommunizieren.
 */
export function OrderDetailTabs({ lang }: Props) {
  return (
    <TabsList>
      <TabsTrigger value="details">{t(lang, "orderDetail.tab.details")}</TabsTrigger>
      <TabsTrigger value="scheduling">{t(lang, "orderDetail.tab.scheduling")}</TabsTrigger>
      <TabsTrigger value="communication">{t(lang, "orderDetail.tab.communication")}</TabsTrigger>
    </TabsList>
  );
}
