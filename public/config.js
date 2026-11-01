// Instellingen die per omgeving verschillen. Dit bestand wordt niet gebouwd, je past het direct aan.
// De publishable/anon-sleutel van Supabase mag openbaar zijn: alle tabellen zijn afgeschermd en
// alles loopt via de dn_-functies (zie supabase/schema.sql). Zet hier NOOIT de service-sleutel.
window.GAME_CONFIG = {
  supabaseUrl: "https://vzfzebmekoxnhxeyfxtf.supabase.co",
  supabaseAnonKey: "sb_publishable_fIUf3gaypFp81_iybwaVCg_QHJKHcEe",
  ads: {
    enabled: false,         // pas aanzetten na goedkeuring door AdSense én met de toestemmingsmelding (CMP) aan
    placeholder: false,     // true = laat grijze vakken zien om de opmaak te testen
    client: "",             // bijv. "ca-pub-1234567890123456"
    slots: { bottom: "" }   // advertentieblok-ID uit AdSense
  }
};
