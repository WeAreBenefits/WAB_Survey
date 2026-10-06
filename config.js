// WAB Fit Survey settings. Ted fills these in after creating the Supabase project.
// The "anon" key is meant to be public: it can ONLY call the 3 survey functions.
// Never put the "service_role" key here.
window.WAB_SURVEY_CONFIG = {
  supabaseUrl: "",        // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",    // Supabase > Project Settings > API > anon public key
  licenseNumber: "",      // CA license number once CDI issues it. Leave "" until then.
  contactName: "Shmuel"   // Who follows up after the survey
};
