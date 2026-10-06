/**
 * French dictionary.
 *
 * This is the ONLY visible language of the application. The dictionary is
 * split by domain and typed with `typeof`, so adding a new locale (ar, en...)
 * only requires creating `src/i18n/dictionaries/<locale>.ts` with the same shape.
 */

export const common = {
  appName: 'Atelier d\u2019écriture',
  appTagline: 'Expérience pédagogique assistée par IA',
  adminArea: 'Administration',
  loading: 'Chargement…',
  save: 'Enregistrer',
  cancel: 'Annuler',
  close: 'Fermer',
  confirm: 'Confirmer',
  back: 'Retour',
  retry: 'Réessayer',
  copy: 'Copier',
  copied: 'Copié',
  yes: 'Oui',
  no: 'Non',
  all: 'Tous',
  none: 'Aucun',
  of: 'sur',
  notAvailable: 'Non disponible',
  seeMore: 'Voir plus',
  seeDetails: 'Voir le détail',
  optional: 'facultatif',
  required: 'obligatoire',
  characters: 'caractères',
  character: 'caractère',
  words: 'mots',
  word: 'mot',
  versions: 'versions',
  version: 'version',
  messages: 'messages',
  message: 'message',
  students: 'étudiants',
  student: 'étudiant',
  emptyState: 'Aucune donnée pour le moment.',
  error: 'Erreur',

  /**
   * French plural: "1 version" but "2 versions". `singular` and `plural` hold
   * the noun alone, so they can also be used inside a longer sentence.
   */
  plural: (count: number, singular: string, plural: string) =>
    `${count} ${count > 1 ? plural : singular}`,
} as const;

export const nav = {
  dashboard: 'Tableau de bord',
  students: 'Étudiants',
  currentExperiment: 'Expérience actuelle',
  previousExperiments: 'Expériences précédentes',
  settings: 'Paramètres',
  logout: 'Déconnexion',
  openMenu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  menu: 'Menu',
} as const;

export const auth = {
  loginTitle: 'Connexion',
  loginSubtitle: 'Accédez à votre espace personnel',
  studentTab: 'Étudiant',
  adminTab: 'Administrateur',
  username: 'Nom d’utilisateur',
  password: 'Mot de passe',
  usernamePlaceholderStudent: 'ex. kdmqta',
  usernamePlaceholderAdmin: 'Nom d’utilisateur administrateur',
  passwordPlaceholder: 'Mot de passe',
  submitStudent: 'Se connecter',
  submitAdmin: 'Se connecter',
  studentHint: 'Votre identifiant vous a été remis par l’administrateur.',
  footerNote: 'Plateforme d’expérimentation pédagogique · Données anonymisées',
  loggingIn: 'Connexion en cours…',
  sessionExpiredTitle: 'Session expirée',
  sessionExpiredBody: 'Votre session n’est plus valide. Veuillez vous reconnecter.',
  accessSuspendedTitle: 'Accès suspendu',
  accessSuspendedBody:
    'Le temps est écoulé. L’expérience est actuellement suspendue.',
  accessSuspendedHint:
    'Vos données sont conservées. Rendez-vous à nouveau ici lorsque l’administrateur rouvrira l’expérience.',
  accessSuspendedAction: 'Se déconnecter',
  goToLogin: 'Aller à la page de connexion',
} as const;

export const admin = {
  dashboardTitle: 'Tableau de bord',
  dashboardSubtitle: 'Vue d’ensemble de l’expérience en cours',
  greeting: 'Bonjour',
  cardAccess: 'Accès étudiants',
  cardActiveExperiment: 'Expérience active',
  cardStudents: 'Étudiants',
  cardAIUsers: 'Utilisateurs de l’IA',
  cardAIUser: 'Utilisateur de l’IA',
  cardExpressions: 'Expressions envoyées',
  cardAIUsersHint: 'ont utilisé l’assistant',
  cardExpressionsHint: 'versions déposées',
  accessEnabled: 'Accès autorisé',
  accessDisabled: 'Accès suspendu',
  accessEnabledAt: 'Accès ouvert à tous les étudiants.',
  accessDisabledAt: 'Aucun étudiant ne peut se connecter actuellement.',
  accessSince: 'Modifié',
  recentActivity: 'Activité récente',
  recentActivityEmpty: 'Aucune activité enregistrée pour le moment.',
  activityAI: 'Message envoyé à l’Assistant IA',
  activityExpression: 'Expression écrite envoyée',
  activityLogin: 'Connexion',
  viewStudent: 'Voir la fiche',
  noExperimentTitle: 'Aucune expérience active',
  noExperimentBody:
    'Créez une expérience pour ouvrir l’accès aux étudiants et leur afficher la question du jour.',
  createFirstExperiment: 'Créer une expérience',
  experimentQuestion: 'Question du jour',
  experimentStarted: 'Démarrée',
  experimentParticipants: 'Participants',
  experimentLastActivity: 'Dernière activité',
  secondsAgo: 'à l’instant',
  minutesAgo: 'il y a {n} min',
  hoursAgo: 'il y a {n} h',
  daysAgo: 'il y a {n} j',
} as const;

/**
 * The two study groups. This is an administrative label only: the assistant
 * answers the same way in both groups, so the teacher can compare the written
 * results afterwards.
 */
export const groups = {
  AI_LIBRE: 'IA libre',
  AI_GUIDEE: 'IA guidée',
  label: 'Groupe',
  all: 'Tous les groupes',
  description:
    'Répartissez la classe en deux groupes. Le choix n’a aucune influence sur les réponses de l’Assistant IA : il sert uniquement à comparer les résultats entre les deux groupes.',
  free: 'IA libre',
  guided: 'IA guidée',
  freeDetail: 'L’étudiant conduit seul sa réflexion.',
  guidedDetail: 'Même assistant, même question : seul le groupe est mémorisé.',
} as const;

export const students = {
  title: 'Étudiants',
  subtitle: 'Tous les comptes créés pour l’expérience',
  create: 'Créer un ou plusieurs étudiants',
  username: 'Identifiant',
  group: 'Groupe',
  createdAt: 'Créé le',
  lastLogin: 'Dernière connexion',
  activity: 'Activité expérience en cours',
  aiUsage: 'Messages IA',
  expressions: 'Expressions',
  lastActivity: 'Dernière activité',
  never: 'Jamais',
  neverConnected: 'Jamais connecté',
  openDetail: 'Ouvrir la fiche',
  empty: 'Aucun étudiant pour le moment.',
  emptyHint:
    'Créez le premier compte étudiant : un identifiant de 6 lettres et un mot de passe de 4 chiffres sont générés automatiquement.',
  createTitle: 'Créer des comptes étudiants',
  createIntro:
    'Choisissez le groupe et le nombre d’étudiants à créer. Un identifiant de 6 lettres et un mot de passe de 4 chiffres sont générés automatiquement pour chacun.',
  groupLabel: 'Groupe',
  groupHint: 'Le groupe n’affecte pas les réponses de l’IA, seulement le classement des résultats.',
  quantityLabel: 'Nombre d’étudiants',
  quantityHint: 'Entre 1 et 50 comptes.',
  creating: 'Création…',
  credentialsTitle: 'Comptes créés',
  credentialsBody:
    'Communiquez ces identifiants aux étudiants. Les mots de passe ne pourront plus être récupérés ensuite : ils devront être réinitialisés un par un.',
  credentialsBodySingle:
    'Communiquez ces identifiants à l’étudiant. Le mot de passe ne peut pas être récupéré ensuite.',
  credentialsUsername: 'Identifiant',
  credentialsPassword: 'Mot de passe',
  copyAll: 'Copier les identifiants',
  copyAllList: 'Copier la liste',
  copyUsername: 'Copier l’identifiant',
  copyPassword: 'Copier le mot de passe',
  created: 'Étudiant créé',
  createdMany: '{n} comptes créés',
  filterLabel: 'Filtrer par groupe',
  groupCounts: '{libre} en IA libre · {guidee} en IA guidée',
  exportPdf: 'Exporter en PDF',
  exportPdfLoading: 'Génération…',
  exportPdfSuccess: 'PDF téléchargé',
  changeGroup: 'Changer de groupe',
  changeGroupTitle: 'Changer de groupe',
  changeGroupIntro:
    'Le compte passe dans l’autre groupe. Sa conversation et ses versions ne changent pas.',
  groupChanged: 'Groupe mis à jour',
  resetPassword: 'Nouveau mot de passe',
  resetPasswordTitle: 'Réinitialiser le mot de passe',
  resetPasswordIntro:
    'Un nouveau mot de passe de 4 chiffres sera généré pour cet étudiant. L’ancien mot de passe cessera de fonctionner immédiatement.',
  resetPasswordWarning:
    'L’étudiant sera déconnecté de tous ses appareils et devra se reconnecter avec le nouveau mot de passe.',
  resetting: 'Réinitialisation…',
  passwordReset: 'Mot de passe réinitialisé',
  newPasswordTitle: 'Nouveau mot de passe',
  newPasswordBody:
    'Communiquez ce mot de passe à l’étudiant. Il ne sera plus jamais affiché ensuite.',
  detailTitle: 'Fiche étudiant',
  detailBack: 'Retour aux étudiants',
  conversationTitle: 'Conversation IA',
  expressionTitle: 'Expression écrite',
  conversationEmpty:
    'Cet étudiant n’a pas utilisé l’Assistant IA pendant cette expérience.',
  expressionEmpty: 'Cet étudiant n’a rien envoyé pour cette expérience.',
  you: 'Étudiant',
  assistant: 'Assistant IA',
  activitySummary: 'Synthèse',
  messagesCount: 'Messages IA',
  versionsCount: 'Versions déposées',
  accountCreated: 'Compte créé',
} as const;

export const experiments = {
  currentTitle: 'Expérience actuelle',
  currentSubtitle: 'La question du jour affichée à tous les étudiants',
  newTitle: 'Nouvelle expérience',
  newIntro:
    'Saisissez la question ou le sujet proposé aux étudiants. Le démarrage archive automatiquement l’expérience précédente et crée une nouvelle conversation IA pour chaque étudiant.',
  questionLabel: 'Question / sujet',
  questionPlaceholder:
    'ex. Rédigez un texte sur l’importance de la lecture dans la vie quotidienne.',
  start: 'Démarrer l’expérience',
  starting: 'Démarrage en cours…',
  confirmArchiveTitle: 'Démarrer une nouvelle expérience ?',
  confirmArchiveBody:
    'L’expérience actuelle sera archivée. Ses données resteront accessibles dans « Expériences précédentes ». Les étudiants verront immédiatement la nouvelle question et leur conversation IA repartira à zéro.',
  confirmStart: 'Démarrer',
  stop: 'Arrêter l’expérience',
  confirmStopTitle: 'Arrêter l’expérience en cours ?',
  confirmStopBody:
    'Les étudiants verront immédiatement l’écran de fin d’expérience : ils ne pourront plus envoyer de message à l’Assistant IA ni déposer de version. L’expérience sera archivée avec la totalité des conversations et des expressions écrites, que vous pourrez consulter à tout moment dans « Expériences précédentes ».',
  confirmStop: 'Arrêter l’expérience',
  stopped: 'Expérience arrêtée et archivée.',
  nothingToStop: 'Aucune expérience n’était en cours.',
  statusActive: 'En cours',
  statusArchived: 'Archivée',
  startedAt: 'Démarrée le',
  duration: 'Durée',
  statsTitle: 'Statistiques de l’expérience',
  previousTitle: 'Expériences précédentes',
  previousSubtitle: 'Toutes les expériences archivées et leurs données',
  previousEmpty: 'Aucune expérience précédente.',
  previousEmptyHint:
    'Les expériences archivées apparaîtront ici avec la totalité des conversations IA et des expressions écrites.',
  experimentNumber: 'Expérience n°{n}',
  archivedAt: 'Archivée le',
  participants: 'Participants',
  viewExperiment: 'Ouvrir l’expérience',
  viewStudentActivity: 'Voir l’activité',
  experimentDetailTitle: 'Détail de l’expérience',
  backToExperiments: 'Retour aux expériences précédentes',
  backToExperiment: 'Retour à l’expérience',
  studentActivityTitle: 'Activité de l’étudiant',
  noParticipants: 'Aucun étudiant n’a encore participé à cette expérience.',
  messagesAndVersions: '{messages} messages · {versions} versions',
} as const;

export const settings = {
  dataTitle: 'Données collectées',
  dataSubtitle:
    'Suppression définitive des conversations et des expressions écrites des étudiants',
  dataWarning:
    'Cette action est irréversible. Exportez d’abord les PDF dont vous avez besoin : les conversations et les versions ne pourront plus être consultées.',
  dataAccountsKept: 'Comptes conservés',
  dataMessages: 'Messages IA à supprimer',
  dataVersions: 'Expressions écrites à supprimer',
  dataExperiments: 'Expériences à supprimer',
  dataExperimentsOptional: 'Supprimer aussi les expériences',
  dataExperimentsOptionalHint:
    'Les questions posées aux étudiants disparaîtront elles aussi. Les comptes étudiants restent utilisables.',
  dataConfirmLabel: 'Tapez SUPPRIMER pour confirmer',
  dataConfirmWord: 'SUPPRIMER',
  dataWipe: 'Vider les données collectées',
  dataWipeTitle: 'Supprimer définitivement les données collectées ?',
  dataWipeBody:
    'Toutes les conversations avec l’Assistant IA et toutes les expressions écrites seront supprimées. Les comptes étudiants et leurs identifiants resteront utilisables : les étudiants perdront simplement l’historique de leur travail.',
  dataWiping: 'Suppression…',
  dataWiped: 'Données supprimées',
  dataWipedDetail:
    '{messages} messages et {versions} expressions supprimées. Les comptes sont conservés.',
  dataNothing: 'Aucune donnée à supprimer pour le moment.',
  title: 'Paramètres',
  subtitle: 'Informations techniques et sécurité',
  profile: 'Profil administrateur',
  security: 'Sécurité',
  aiService: 'Service IA',
  username: 'Identifiant administrateur',
  createdAt: 'Compte créé le',
  lastLogin: 'Dernière connexion',
  securityHash: 'Mots de passe',
  securityHashValue: 'Hachage bcrypt (sel aléatoire)',
  securitySessions: 'Sessions',
  securitySessionsValue: 'Cookie signé HttpOnly, SameSite=Lax',
  accessControl: 'Contrôle d’accès',
  accessControlValue:
    'L’accès des étudiants se règle depuis le tableau de bord.',
  aiProvider: 'Fournisseur',
  aiModel: 'Modèle',
  aiStatus: 'État du service',
  aiConfigured: 'Configuré',
  aiNotConfigured: 'Non configuré',
  aiNotConfiguredHint:
    'Renseignez OPENAI_API_KEY dans les variables d’environnement du serveur pour activer l’Assistant IA.',
  about: 'À propos',
  aboutValue:
    'Plateforme d’expérimentation pédagogique : un assistant IA et une expression écrite, deux espaces indépendants.',
} as const;

export const student = {
  dashboardTitle: 'Expérience en cours',
  logout: 'Déconnexion',
  questionTitle: 'Question du jour',
  questionHint: 'Échangez avec l’Assistant IA et rédigez votre expression ci-dessous.',
  aiTitle: 'Assistant IA',
  aiAuthor: 'Assistant IA',
  aiAuthorStudent: 'Vous',
  aiSubtitle:
    'Posez vos questions librement. Cet espace est indépendant de votre expression écrite.',
  aiPlaceholder: 'Écrivez votre message à l’assistant…',
  aiSend: 'Envoyer',
  aiSending: 'Envoi en cours…',
  aiEmpty:
    'La conversation commence à votre initiative. Écrivez votre premier message ci-dessous.',
  aiEmptyHint:
    'Vous pouvez demander une explication, des idées, des exemples, la correction d’un texte, ou même une réponse complète.',
  aiIndependentNote:
    'Votre expression écrite n’est jamais transmise à l’Assistant IA.',
  expressionTitle: 'Expression écrite',
  expressionHistory: 'Historique des versions',
  expressionSubtitle:
    'Rédigez votre texte puis envoyez-le. Chaque envoi crée une nouvelle version conservée.',
  expressionPlaceholder:
    'Rédigez ici votre texte… (la question du jour se trouve en haut de cette page)',
  expressionSend: 'Envoyer',
  expressionSending: 'Envoi en cours…',
  expressionEmpty:
    'Aucune version envoyée pour le moment. Votre première version apparaîtra ici.',
  expressionEmptyHint:
    'Écrivez votre texte puis cliquez sur « Envoyer » pour créer la version 1.',
  editingFrom: 'Modification de la version {n}',
  editingHint:
    'Votre envoi créera une nouvelle version : la version {n} restera conservée.',
  edit: 'Modifier',
  editing: 'Modification en cours…',
  cancelEdit: 'Annuler la modification',
  latestVersion: 'Dernière version',
  version: 'Version',
  versionSaved: 'Version {n} enregistrée',
  newVersionNotice:
    'Nouvelle version créée à partir de la version {n}.',
  wordCount: '{n} mots',
  charCount: '{n} caractères',
  loadingWorkspace: 'Chargement de l’expérience…',
  noExperimentTitle: 'Aucune expérience en cours',
  noExperimentBody:
    'L’expérience n’a pas encore démarré. Revenez plus tard : la question du jour apparaîtra ici.',
  experimentStoppedTitle: 'L’expérience est terminée',
  experimentStoppedBody:
    'Votre enseignant a arrêté l’expérience. Vos échanges avec l’Assistant IA et vos versions écrites restent conservés.',
  accessSuspendedTitle: 'Accès suspendu',
  accessSuspendedBody:
    'Le temps est écoulé. L’expérience est actuellement suspendue.',
  accessSuspendedAction: 'Se déconnecter',
  sessionRevoked: 'Votre session n’est plus valide. Veuillez vous reconnecter.',
  serviceUnavailableTitle: 'Service momentanément indisponible',
  serviceUnavailableBody:
    'Impossible de vérifier l’état de l’expérience pour le moment. Veuillez réessayer dans un instant.',
  disconnect: 'Se déconnecter',
  sentAt: 'Envoyé',
  aiError: 'Impossible de contacter l’assistant IA.',
} as const;

export const access = {
  toggleTitle: 'Autoriser l’accès des étudiants',
  toggleDescription:
    'Lorsque l’accès est suspendu, les étudiants ne peuvent plus se connecter et sont déconnectés immédiatement.',
  suspended: 'Accès suspendu',
  allowed: 'Accès autorisé',
  confirmSuspendTitle: 'Suspendre l’accès des étudiants ?',
  confirmSuspendBody:
    'Le temps est écoulé. L’expérience est actuellement suspendue.',
  confirmSuspendBodyAdmin:
    'Tous les étudiants seront déconnectés immédiatement et ne pourront plus se connecter. Aucune donnée ne sera supprimée.',
  suspend: 'Suspendre l’accès',
  resume: 'Autoriser l’accès',
  updated: 'Accès étudiant mis à jour',
  resumeTitle: 'Rouvrir l’accès aux étudiants',
  groupToggleDescription:
    'Autorisez ou suspendez la connexion de chaque groupe indépendamment. Les étudiants du groupe suspendu sont déconnectés à leur prochaine requête ; les données sont conservées.',
  groupAllowed: 'Connexion du groupe autorisée',
  groupSuspended: 'Connexion du groupe suspendue',
  bothGroupsSuspended:
    'Les deux groupes sont suspendus : aucun étudiant ne pourra se connecter.',
} as const;

export const errors = {
  genericTitle: 'Une erreur est survenue',
  genericBody:
    'Le service a rencontré un problème inattendu. Veuillez réessayer dans un instant.',
  databaseTitle: 'Base de données injoignable',
  databaseBody:
    'La connexion à la base de données a échoué. Vérifiez la variable DATABASE_URL et les identifiants PostgreSQL, puis redémarrez le serveur si le problème persiste.',
} as const;

export const fr = {
  common,
  nav,
  auth,
  admin,
  groups,
  students,
  experiments,
  settings,
  student,
  access,
  errors,
};

export type Dictionary = typeof fr;
export type Locale = 'fr';

/** The application only ships one locale; the parameter keeps the API stable. */
export function getDictionary(locale: Locale = 'fr'): Dictionary {
  void locale;
  return fr;
}