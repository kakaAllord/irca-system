// The flow, ported from the design prototype and kept as the single source of
// truth for both halves of the app: the server decides which step a URL maps to
// and re-validates what comes back, the client renders the same definitions.
// Nothing here touches the database or the DOM, so it is safe on both sides.

export type Lang = 'en' | 'sw' | 'fr';
export const LANGS: Lang[] = ['en', 'sw', 'fr'];

export type Txt = Record<Lang, string>;
const T = (en: string, sw: string, fr: string): Txt => ({ en, sw, fr });

export const WARDS = [
  'Arusha CBD', 'Kaloleni', 'Levolosi', 'Unga Ltd', 'Kijenge', 'Themi', 'Njiro',
  'Olorien', 'Lemara', 'Baraa', 'Moshono', 'Sakina', 'Muriet', 'Engutoto',
  'Kimandolu', 'Olasiti', 'Sombetini', 'Ngarenaro', 'Elerai', 'Daraja Mbili',
];

// Arusha itself is not here: someone from the outskirts is still from Arusha
// and belongs on the ward list, not on the list of other regions.
export const REGIONS = [
  'Dar es Salaam', 'Dodoma', 'Geita', 'Iringa', 'Kagera',
  'Kilimanjaro', 'Manyara', 'Mbeya', 'Morogoro', 'Mwanza', 'Singida', 'Tabora',
  'Tanga', 'Zanzibar',
];


export const UI = {
  cont: T('Continue', 'Endelea', 'Continuer'),
  finish: T('Finish', 'Maliza', 'Terminer'),
  saved: T('Saved · you can come back', 'Imehifadhiwa · unaweza kurudi', 'Enregistré · vous pouvez revenir'),
  pastors: T('TALK TO A PASTOR', 'ZUNGUMZA NA MCHUNGAJI', 'PARLER À UN PASTEUR'),
  saveNumber: T('Save number', 'Hifadhi namba', 'Enregistrer'),
  another: T('Register someone else', 'Sajili mtu mwingine', "Inscrire quelqu'un d'autre"),
  done: T('DONE', 'IMEKAMILIKA', 'TERMINÉ'),
  yes: T('Yes', 'Ndiyo', 'Oui'),
  notYet: T('Not yet', 'Bado', 'Pas encore'),
  no: T('No', 'Hapana', 'Non'),

  changeLangH: T(
    'Which language would you prefer?',
    'Ungependa lugha gani?',
    'Quelle langue préférez-vous ?',
  ),
  changeLangSub: T(
    'Change it whenever you like. Nothing you have answered is lost.',
    'Badilisha wakati wowote. Hakuna ulichojibu kinachopotea.',
    'Changez quand vous voulez. Rien de ce que vous avez répondu ne sera perdu.',
  ),

  welcomeH: T('Karibu IRCA', 'Karibu IRCA', 'Karibu IRCA'),
  welcomeSub: T(
    'We would love to know who worshipped with us today. Just a short chat, most taps very little typing.',
    'Tungependa kukufahamu uliyeabudu nasi leo. Ni mazungumzo mafupi, kubonyeza zaidi kuandika kidogo.',
    "Nous aimerions savoir qui a prié avec nous aujourd'hui. Une courte conversation, surtout des choix.",
  ),

  phoneHint: T(
    'So a pastor can reach you, and so you never fill this in twice.',
    'Ili mchungaji aweze kuwasiliana nawe, na usijaze tena.',
    "Pour qu'un pasteur puisse vous joindre, et pour ne jamais recommencer.",
  ),
  emailPh: T('Email, optional', 'Barua pepe, kama unayo', 'Email, si vous voulez'),
  doneTitle: T(
    'Thank you {name}, it has been good hearing from you.',
    'Asante {name}.',
    'Merci {name}, quel plaisir de vous lire.',
  ),
  doneTitleNo: T(
    'Thank you, it has been good hearing from you.',
    'Asante.',
    'Merci, quel plaisir de vous lire.',
  ),
  doneBody: T(
    'Karibu sana IRCA. We are glad to have you here.',
    'Karibu sana IRCA. Tunafurahi kuwa nawe hapa.',
    'Karibu sana IRCA. Nous sommes heureux de vous accueillir.',
  ),

  // "This one we do need" told someone with four questions on the screen
  // nothing at all. Both of these name the question that is actually holding
  // Continue back, filled in from the same rules that grey the button out, so
  // the message and the button can never be telling different stories.
  eStillPick: T('Still to pick: {q}', 'Bado hujachagua: {q}', 'Reste à choisir : {q}'),
  eStillFill: T('Still to fill in: {q}', 'Bado hujajaza: {q}', 'Reste à remplir : {q}'),
  eName: T('Please tell us your name', 'Tafadhali tuambie jina lako', 'Dites-nous votre nom'),
  ePhone: T('A working phone number is needed', 'Namba sahihi ya simu inahitajika', 'Un numéro valide est nécessaire'),
  eTaken: T(
    'That number is already registered. Ask the office for your link.',
    'Namba hiyo tayari imesajiliwa. Muulize ofisi kiungo chako.',
    'Ce numéro est déjà enregistré. Demandez votre lien au bureau.',
  ),

  lblFriend: T(
    'Who invited you? We would like to thank them.',
    'Nani alikualika? Tungependa kumshukuru.',
    'Qui vous a invité ? Nous aimerions le remercier.',
  ),
  lblName: T('Your full name', 'Jina lako kamili', 'Votre nom complet'),
  lblReach: T('How can we reach you?', 'Tutawasilianaje nawe?', 'Comment vous joindre ?'),
  // Plain nouns rather than questions: these label a row that spends most of
  // its life folded down to the answer, and "Gender: Female" reads as a line
  // of a summary where "Are you male or female?: Female" reads as an argument.
  lblGender: T('Gender', 'Jinsia', 'Genre'),
  lblAge: T('Age group', 'Kundi la umri', "Tranche d'âge"),
  phName: T('e.g. Neema Mollel', 'mfano Neema Mollel', 'ex. Neema Mollel'),
  male: T('Male', 'Kiume', 'Homme'),
  female: T('Female', 'Kike', 'Femme'),
  a18: T('Under 18', 'Chini ya 18', 'Moins de 18'),
  a19: T('19 – 35', '19 – 35', '19 – 35'),
  a36: T('36 – 44', '36 – 44', '36 – 44'),
  a45: T('45 & above', '45 na zaidi', '45 et plus'),

  pickAny: T('Select all that apply', 'Chagua zote zinazokuhusu', 'Choisissez tout ce qui vous concerne'),

  lblWard: T('Which part of Arusha?', 'Unaishi mtaa gani wa Arusha?', "Quel quartier d'Arusha ?"),
  phWard: T('Choose your area…', 'Chagua mtaa wako…', 'Choisissez votre quartier…'),
  wardOther: T('Somewhere else', 'Mahali pengine', 'Ailleurs'),
  phWardOther: T('Name your area', 'Taja mtaa wako', 'Nommez votre quartier'),
  lblRegion: T('Which region are you from?', 'Unatoka mkoa gani?', 'De quelle région venez-vous ?'),
  lblCountry: T('Which country are you from?', 'Unatoka nchi gani?', 'De quel pays venez-vous ?'),
  phRegion: T('Choose your region…', 'Chagua mkoa…', 'Choisissez votre région…'),
  phCountry: T('e.g. Kenya, Rwanda, France', 'mfano Kenya, Rwanda, Ufaransa', 'ex. Kenya, Rwanda, France'),
  lblStay: T('How long are you in Arusha?', 'Utakaa Arusha muda gani?', 'Combien de temps à Arusha ?'),
  lblOften: T('How often do you come to Arusha?', 'Unakuja Arusha mara ngapi?', 'À quelle fréquence venez-vous ?'),
  s1: T('Just today', 'Leo tu', "Aujourd'hui"),
  s2: T('A few days', 'Siku chache', 'Quelques jours'),
  s3: T('A week or so', 'Kama wiki', 'Environ une semaine'),
  s4: T('A few weeks', 'Wiki kadhaa', 'Quelques semaines'),
  s5: T('Months', 'Miezi', 'Des mois'),
  s6: T('Moving here', 'Nahamia hapa', "Je m'installe"),
  o1: T('First time', 'Mara ya kwanza', 'Première fois'),
  o2: T('Every week', 'Kila wiki', 'Chaque semaine'),
  o3: T('Monthly', 'Kila mwezi', 'Chaque mois'),
  o4: T('Few times a year', 'Mara chache kwa mwaka', 'Quelques fois par an'),

  // Country picker
  pickCountry: T('Which country?', 'Nchi gani?', 'Quel pays ?'),
  searchCountry: T('Search a country', 'Tafuta nchi', 'Rechercher un pays'),
  noMatch: T('Nothing matches that', 'Hakuna inayolingana', 'Aucun résultat'),
  ePhoneShort: T(
    'That number looks too short for {country}',
    'Namba hiyo ni fupi kwa {country}',
    'Ce numéro est trop court pour {country}',
  ),
  ePhoneLong: T(
    'That number looks too long for {country}',
    'Namba hiyo ni ndefu kwa {country}',
    'Ce numéro est trop long pour {country}',
  ),

  // Date wheel
  dobTrigger: T('Tap to set your date of birth', 'Bonyeza kuweka tarehe ya kuzaliwa', 'Touchez pour indiquer votre date de naissance'),
  dobDay: T('Day', 'Siku', 'Jour'),
  dobMonth: T('Month', 'Mwezi', 'Mois'),
  dobYear: T('Year', 'Mwaka', 'Année'),
  dobDone: T('That is my date', 'Hiyo ndiyo tarehe yangu', "C'est ma date"),
  dobLock: T('That is it', 'Hiyo ndiyo', "C'est ça"),
  dobChange: T('Change', 'Badilisha', 'Modifier'),
  months: {
    en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    sw: ['Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba'],
    fr: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  },

  phMinistry: T('Something else? e.g. Counselling, Finance', 'Nyingine? mfano Ushauri, Fedha', 'Autre ? ex. Conseil, Finances'),

  lblDob: T('When were you born?', 'Ulizaliwa lini?', 'Quand êtes-vous né ?'),
  qSaved: T('Are you born again?', 'Je umeokoka?', 'Êtes-vous né de nouveau ?'),
  qBapt: T('Have you been baptised by immersion?', 'Je umebatizwa kwa maji mengi?', 'Avez-vous été baptisé par immersion ?'),
  qHoly: T('Have you been filled with the Holy Spirit?', 'Je umejazwa na Roho Mtakatifu?', 'Avez-vous été rempli du Saint-Esprit ?'),
  qPrev: T('Were you worshipping at another church before?', 'Ulikuwa ukiabudu kanisa lingine kabla?', 'Fréquentiez-vous une autre église ?'),
  lblWantMore: T(
    'Would you like to know more about our church?',
    'Ungependa kujua zaidi kuhusu kanisa letu?',
    'Souhaitez-vous en savoir plus sur notre église ?',
  ),
  lblPrayer: T('How can we pray for you?', 'Tunaweza kukuombea nini?', 'Comment pouvons-nous prier pour vous ?'),
  // Shown to whoever says no, so the screen does not simply go quiet on them.
  noMoreThanks: T(
    'That is everything. Thank you for your time, and karibu tena.',
    'Basi tumemaliza. Asante kwa muda wako, na karibu tena.',
    'C’est tout. Merci pour votre temps, et karibu tena.',
  ),
  lblSavedYear: T('Which year?', 'Mwaka gani?', 'Quelle année ?'),
  lblBaptYear: T('Which year were you baptised?', 'Ulibatizwa mwaka gani?', 'Année du baptême ?'),
  lblPrevChurchName: T('Which church?', 'Kanisa gani?', 'Quelle église ?'),
  lblChildren: T('Their names', 'Majina yao', 'Leurs noms'),
  phSavedYear: T('Which year? e.g. 2018', 'Mwaka gani? mfano 2018', 'Quelle année ? ex. 2018'),
  phBaptYear: T('Year of baptism', 'Mwaka wa ubatizo', 'Année du baptême'),
  phChurch: T('Name of the church', 'Jina la kanisa', "Nom de l'église"),

  lblMarital: T('What is your marital status?', 'Hali yako ya ndoa ikoje?', 'État civil ?'),
  lblMarriedYear: T('Which year were you married?', 'Mlifunga ndoa mwaka gani?', 'Année du mariage ?'),
  phMarriedYear: T('e.g. 2015', 'mfano 2015', 'ex. 2015'),
  phChild: T("Child's name", 'Jina la mtoto', "Nom de l'enfant"),
  addChild: T('Add another child', 'Ongeza mtoto mwingine', 'Ajouter un enfant'),
  lblKids: T('Do you have children?', 'Je una watoto?', 'Avez-vous des enfants ?'),
  m1: T('Single', 'Mseja', 'Célibataire'),
  m2: T('Married', 'Nimeoa / Nimeolewa', 'Marié(e)'),
  m3: T('Widowed', 'Mjane', 'Veuf / Veuve'),
  m4: T('Separated', 'Tumetengana', 'Séparé(e)'),

  lblOcc: T('Occupation type', 'Aina ya shughuli', "Type d'occupation"),
  occStudy: T('Studying', 'Ninasoma', "J'étudie"),
  occWork: T('Working', 'Nafanya kazi', 'Je travaille'),

  lblStudy: T('Tell us where you study', 'Tuambie unasomea wapi', 'Où étudiez-vous ?'),
  lblWorkQ: T('What work do you do?', 'Unafanya kazi gani?', 'Quel travail faites-vous ?'),
  workHint: T('More than one is fine.', 'Unaweza kuandika zaidi ya moja.', 'Plusieurs réponses possibles.'),
  phSchool: T('College, e.g. ARU, UDSM', 'Chuo, mfano ARU, UDSM', 'École, ex. ARU, UDSM'),
  phCourse: T('Course, e.g. Education', 'Kozi, mfano Ualimu', 'Filière, ex. Éducation'),
  phYear: T('Year of study, e.g. Year 2', 'Mwaka wa masomo, mfano Mwaka 2', 'Année, ex. 2e année'),
  phWork: T('e.g. Teacher, Nurse, Tailor, Farmer', 'mfano Mwalimu, Muuguzi, Fundi cherehani', 'ex. Enseignant, Infirmier, Couturier'),

  lblLiked: T('What did you like about our service today?', 'Ulipenda nini katika ibada yetu ya leo?', "Qu'avez-vous aimé dans notre culte aujourd'hui ?"),
  likedHint: T('It helps us serve better next Sunday.', 'Inatusaidia kuhudumu vizuri Jumapili ijayo.', 'Cela nous aide pour dimanche prochain.'),

  hasKids: T('has children', 'ana watoto', 'a des enfants'),

  // The admin-sent return link (design screen 25).
  backH: T('Karibu, {name}.', 'Karibu, {name}.', 'Karibu, {name}.'),
  backSub: T(
    'Help us finish the few details that are left. You will not be asked anything you have already answered.',
    'Tusaidie kumalizia taarifa chache zilizobaki. Hutaulizwa tena uliyokwisha jibu.',
    'Aidez-nous à terminer les quelques détails restants. On ne vous redemandera rien.',
  ),
  backLeft: T('{n} of {total} left', 'Zimebaki {n} kati ya {total}', '{n} sur {total} restantes'),
  backStopped: T('You stopped at: {step}', 'Uliishia kwenye: {step}', 'Vous vous êtes arrêté à : {step}'),
  backCta: T('Carry on where you left off', 'Endelea ulipoishia', 'Reprendre où vous en étiez'),
  backNote: T('This link is yours alone', 'Kiungo hiki ni chako pekee', "Ce lien n'appartient qu'à vous"),
} as const;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type Values = {
  heard: string[]; heardOtherText: string; friendName: string;
  fullname: string; gender: string; age: string;
  visit: string[]; visitOtherText: string;
  where: string; ward: string; wardOther: string;
  region: string; country: string; stay: string; often: string;
  dialCc: string; dial: string; phone: string; email: string;
  occ: string; school: string; course: string; year: string; profession: string;
  interest: string[];
  dob: string;
  saved: boolean | null; savedYear: string;
  bapt: boolean | null; baptYear: string;
  holy: boolean | null;
  prevChurch: boolean | null; prevChurchName: string;
  marital: string; marriedYear: string; kids: boolean | null; children: string[];
  ministries: string[]; otherMinistry: string;
  prayer: string; liked: string; wantMore: boolean | null;
};

export const EMPTY_VALUES: Values = {
  heard: [], heardOtherText: '', friendName: '',
  fullname: '', gender: '', age: '',
  visit: [], visitOtherText: '',
  where: '', ward: '', wardOther: '', region: '', country: '', stay: '', often: '',
  dialCc: 'TZ', dial: '+255', phone: '', email: '',
  occ: '', school: '', course: '', year: '', profession: '',
  interest: [],
  dob: '', saved: null, savedYear: '', bapt: null, baptYear: '', holy: null,
  prevChurch: null, prevChurchName: '',
  marital: '', marriedYear: '', kids: null, children: [''],
  ministries: [], otherMinistry: '',
  prayer: '', liked: '', wantMore: null,
};

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type Opt = { val: string; label: Txt };

export type StepType =
  | 'pick' | 'text' | 'area' | 'who'
  | 'phone' | 'occDetail' | 'faith' | 'family' | 'serve' | 'closing' | 'intent';

export type Step = {
  id: string;
  type: StepType;
  /** Which Values key a simple pick/text/area step writes to. */
  key?: keyof Values;
  multi?: boolean;
  req?: boolean;
  skippable?: boolean;
  /** Shown only when this predicate holds over the answers so far. */
  when?: (v: Values) => boolean;
  /** Shown only on the membership path. */
  memberOnly?: boolean;
  /** Where the free-text follow-up for the "Other" option is written. */
  other?: keyof Values;
  /**
   * A free-text follow-up that opens under the list when one particular option
   * is ticked — the same idea as `other`, without being tied to that option.
   */
  follow?: { on: string; key: keyof Values; label: Txt; ph: Txt };
  q: Txt;
  sub?: Txt;
  ph?: Txt;
  note?: Txt;
  ack?: Txt;
  opts?: Opt[];
  otherPh?: Txt;
  /**
   * The option on a multi-answer question that means "none of the others".
   * Ticking it clears the rest, and ticking any other clears it, so nobody can
   * ask for nothing and to join the church in the same breath.
   */
  exclusive?: string;
  /** More than one chip question on the same screen. */
  groups?: ChipGroup[];
  /** Short name for this step, used on the return screen's checklist. */
  short: Txt;
};

/** One multi-answer question, where a screen carries several of them. */
export type ChipGroup = {
  key: 'visit' | 'interest' | 'where';
  /** Omitted for the first group, which the screen's own heading already asks. */
  label?: Txt;
  opts: Opt[];
  other?: keyof Values;
  otherPh?: Txt;
  exclusive?: string;
  /** One answer rather than several, stored as a plain string. */
  single?: boolean;
};

/**
 * Every (answer key, option list) pair a step offers, whether it holds one
 * question or several. Review, insights and the label lookup all read a step
 * through this, so a screen that grows a second question does not quietly drop
 * out of the office's numbers.
 */
export function stepGroups(step: Step): { key: keyof Values; label: Txt; opts: Opt[] }[] {
  if (step.groups) {
    return step.groups.map(g => ({ key: g.key, label: g.label ?? step.q, opts: g.opts }));
  }
  if (step.key && step.opts) return [{ key: step.key, label: step.q, opts: step.opts }];
  return [];
}

// Option values that the rest of the flow branches on. Named once here so a
// screen and the rule that reads its answer cannot drift apart.
export const JOINING = 'Joining the church';
export const SERVING = 'Serving';
export const FRIEND = 'A friend';

export const STEPS: Step[] = [
  {
    // Chips rather than a column of checkboxes. This is the first thing anyone
    // sees, and a stack of ticked boxes reads as a form to be filled in; a row
    // of chips reads as a question being asked. The labels are short for the
    // same reason — a chip is a word, not a sentence.
    id: 'heard', type: 'pick', key: 'heard', multi: true, req: true,
    other: 'heardOtherText',
    q: T('How did you hear about IRCA?', 'Uliifahamuje IRCA?', 'Comment avez-vous connu IRCA ?'),
    sub: T('Start us off here.', 'Tuanzie hapa.', 'Commençons ici.'),
    short: T('How you heard', 'Uliifahamuje IRCA', 'Comment vous nous avez connus'),
    opts: [
      { val: 'A friend', label: T('A friend invited me', 'Rafiki alinialika', "Un ami m'a invité") },
      { val: 'Social media', label: T('Social media', 'Mitandao ya kijamii', 'Réseaux sociaux') },
      { val: 'Outreach', label: T('Church outreach', 'Uinjilisti', 'Évangélisation') },
      { val: 'Walked past', label: T('Passing by', 'Nilikuwa napita tu', 'Je passais') },
      { val: 'Other', label: T('Another way', 'Njia nyingine', 'Autrement') },
    ],
    otherPh: T('Which way?', 'Njia ipi?', 'De quelle manière ?'),
    // Naming the friend used to be a screen of its own. It is one short box
    // that only some people fill in, and it belongs under the option that asks
    // for it, the same as every other follow-up on this form.
    follow: {
      on: FRIEND,
      key: 'friendName',
      label: UI.lblFriend,
      ph: T("Your friend's name", 'Jina la rafiki yako', 'Le nom de votre ami'),
    },
  },
  {
    // Everything about the person and how to reach them, on one screen.
    //
    // Six answers would not fit if each one kept its options on show: an
    // earlier attempt at this scrolled past its own heading on a 360px phone.
    // So a question folds the moment it is answered, down to its name and the
    // answer as a badge. What is left open is the one question still to do,
    // which keeps the screen the length of a single question however many it
    // is actually carrying.
    id: 'who', type: 'who', req: true,
    ack: T('Asante. Now, so we know who we are talking to.', 'Asante. Sasa, tujuane.', 'Merci. Maintenant, faisons connaissance.'),
    q: T('Tell us about you.', 'Tujuane nawe.', 'Parlez-nous de vous.'),
    short: T('About you', 'Wewe ni nani', 'À propos de vous'),
  },
  {
    // Why they came, what they would like from us, and whether they live here:
    // everything about today's visit, on one screen, asked one at a time. Each
    // question shows its options only while it is the one being answered and
    // folds to its answer when it is done, which is what lets a screen hold
    // three questions and a branch without becoming a wall.
    id: 'visit', type: 'intent', req: true,
    q: T('About your visit', 'Kuhusu ujio wako', 'Votre visite'),
    short: T('Your visit', 'Ujio wako', 'Votre visite'),
    groups: [
      {
        key: 'visit',
        label: T('What describes your visit today?', 'Ni kipi kinachoelezea ujio wako leo?', 'Ce qui décrit votre visite ?'),
        other: 'visitOtherText',
        otherPh: T('Tell us in your own words', 'Andika kwa maneno yako', 'Dites-le avec vos mots'),
        opts: [
          { val: 'First time visitor', label: T('First time visitor', 'Mgeni wa mara ya kwanza', 'Première visite') },
          { val: 'Just greeting', label: T('Visiting or greeting', 'Natembelea au kusalimu', 'En visite ou pour saluer') },
          { val: 'Passing through', label: T('Traveler or passing through', 'Msafiri au napita tu', 'De passage') },
          { val: 'Here for work', label: T('Here for work', 'Nipo kikazi', 'Pour le travail') },
          { val: 'Other', label: T('Other', 'Nyingine', 'Autre') },
        ],
      },
      {
        key: 'where',
        single: true,
        label: T('Do you live here in Arusha?', 'Je unaishi hapa Arusha?', 'Habitez-vous ici à Arusha ?'),
        opts: [
          { val: 'arusha', label: T('Yes, in Arusha', 'Ndiyo, Arusha', 'Oui, à Arusha') },
          { val: 'region', label: T('Another region', 'Mkoa mwingine', 'Une autre région') },
          { val: 'country', label: T('Another country', 'Nchi nyingine', 'Un autre pays') },
        ],
      },
    ],
  },
  {
    // What they made of today, and then the question that decides whether we
    // ask anything further.
    //
    // Someone who does not want to hear more from us has no reason to be asked
    // what they would like from us or what to pray about: those two are the
    // start of a conversation, and this is where they say whether they want
    // one. Answer no and the form ends here with thanks.
    //
    // It sits ahead of the joining questions because what they are interested
    // in is answered here, and that answer is what opens them.
    id: 'prayer', type: 'closing', req: true,
    q: T('Before we finish', 'Kabla hatujamaliza', 'Avant de terminer'),
    ph: T('Write your prayer request here…', 'Andika ombi lako hapa…', 'Écrivez votre demande ici…'),
    note: T('Only the pastoral team reads prayer requests.', 'Timu ya uchungaji pekee inasoma maombi haya.', "Seule l'équipe pastorale lit les demandes."),
    short: T('Before we finish', 'Kabla hatujamaliza', 'Avant de terminer'),
    groups: [
      {
        key: 'interest',
        label: T('What are you interested in?', 'Unavutiwa na nini?', "Qu'est-ce qui vous intéresse ?"),
        exclusive: 'Nothing for now',
        opts: [
          { val: 'Salvation', label: T('Give my life to Christ', 'Kumpokea Kristo', 'Donner ma vie au Christ') },
          { val: 'Baptism', label: T('Be baptised', 'Kubatizwa', 'Être baptisé') },
          { val: JOINING, label: T('Join the church', 'Kujiunga na kanisa', "Rejoindre l'église") },
          { val: 'Renewing my commitment', label: T('Renew my vows', 'Kuhuisha ahadi', 'Renouveler mes vœux') },
          { val: 'Serving', label: T('Serve somewhere', 'Kuhudumu', 'Servir') },
          { val: 'Nothing for now', label: T('Nothing for now', 'Hakuna kwa sasa', 'Rien pour le moment') },
        ],
      },
    ],
  },
  {
    // Where they study or what they do, asked only of the people joining the
    // church — a visitor passing through on holiday has no reason to be typing
    // their course code into a welcome form.
    id: 'occDetail', type: 'occDetail', memberOnly: true, req: true, when: v => !!v.occ,
    q: T('A little more about your days', 'Kidogo zaidi kuhusu siku zako', 'Un peu plus sur vos journées'),
    sub: T(
      'Picking up on what you told us earlier.',
      'Tunaendelea na ulichotuambia awali.',
      'Nous reprenons ce que vous nous avez dit.',
    ),
    short: T('Study or work details', 'Maelezo ya masomo au kazi', 'Détails études ou travail'),
  },
  {
    id: 'faith', type: 'faith', memberOnly: true,
    q: T('Your walk with God', 'Safari yako na Mungu', 'Votre marche avec Dieu'),
    sub: T('Answer what you can. There is no wrong answer here.', 'Jibu unavyoweza. Hakuna jibu baya hapa.', 'Répondez ce que vous pouvez. Aucune mauvaise réponse.'),
    short: T('Your walk with God', 'Safari yako na Mungu', 'Votre marche avec Dieu'),
  },
  {
    id: 'family', type: 'family', memberOnly: true,
    q: T('And your family', 'Na familia yako', 'Et votre famille'),
    sub: T('Two quick ones.', 'Mawili ya haraka.', 'Deux questions rapides.'),
    short: T('Your family', 'Familia yako', 'Votre famille'),
  },
  {
    // Asked of anyone who raised their hand to serve, not only of the people
    // joining. Someone who ticks "I would like to serve somewhere" and is never
    // asked where has been left holding an offer nobody took up.
    id: 'serve', type: 'serve', key: 'ministries', multi: true,
    when: v => v.interest.includes(SERVING) || v.interest.includes(JOINING),
    q: T('Where would you love to serve?', 'Ungependa kuhudumu wapi?', 'Où aimeriez-vous servir ?'),
    sub: T('Pick any. You can change this later.', 'Chagua zozote. Unaweza kubadilisha baadaye.', 'Choisissez librement. Modifiable plus tard.'),
    short: T('Where you would serve', 'Huduma', 'Votre service'),
    opts: [
      { val: 'Worship', label: T('Worship', 'Uimbaji', 'Louange') },
      { val: 'Ushering', label: T('Ushering', 'Upokeaji', 'Accueil') },
      { val: 'Media', label: T('Media & sound', 'Media na sauti', 'Média & son') },
      { val: 'Children', label: T("Children's church", 'Watoto', 'Enfants') },
      { val: 'Youth', label: T('Youth', 'Vijana', 'Jeunesse') },
      { val: 'Intercession', label: T('Intercession', 'Maombezi', 'Intercession') },
      { val: 'Evangelism', label: T('Evangelism', 'Uinjilisti', 'Évangélisation') },
      { val: 'Hospitality', label: T('Hospitality', 'Ukarimu', 'Hospitalité') },
      { val: 'Ladies', label: T("Ladies' fellowship", 'Ushirika wa akina mama', 'Groupe des femmes') },
      { val: 'Men', label: T("Men's fellowship", 'Ushirika wa akina baba', 'Groupe des hommes') },
    ],
  },
];

// ---------------------------------------------------------------------------
// Which steps apply, and where we are in them
// ---------------------------------------------------------------------------

/**
 * The steps this visitor actually sees, given what they have answered so far.
 * Recomputed on every request rather than stored: ticking "join the church"
 * inserts three steps mid-flow, and a saved index would silently start
 * pointing at the wrong question afterwards.
 */
export type FaithQ =
  | 'dob' | 'saved' | 'savedYear' | 'bapt' | 'baptYear' | 'holy' | 'prevChurch' | 'prevChurchName';

/**
 * The walk-with-God questions that currently apply, in order.
 *
 * Two rules, and both halves of the app read them from here so they cannot
 * drift apart:
 *
 *  - Someone who is not yet born again is not asked about their baptism or
 *    about being filled with the Holy Spirit. Those questions presuppose the
 *    first one, and asking anyway reads as not listening.
 *  - A follow-up only exists once its parent has been answered yes.
 */
export function faithQuestions(v: Values): FaithQ[] {
  const out: FaithQ[] = ['dob', 'saved'];
  if (v.saved === true) {
    out.push('savedYear', 'bapt');
    if (v.bapt === true) out.push('baptYear');
    out.push('holy');
  }
  out.push('prevChurch');
  if (v.prevChurch === true) out.push('prevChurchName');
  return out;
}

/** Whether one walk-with-God question has been answered. */
export function faithAnswered(q: FaithQ, v: Values): boolean {
  switch (q) {
    case 'saved': return v.saved !== null;
    case 'bapt': return v.bapt !== null;
    case 'holy': return v.holy !== null;
    case 'prevChurch': return v.prevChurch !== null;
    // The free-text follow-ups are never compulsory.
    default: return true;
  }
}

export function applicableSteps(v: Values): Step[] {
  const member = v.interest.includes(JOINING);
  return STEPS.filter(s => {
    if (s.memberOnly && !member) return false;
    if (s.when && !s.when(v)) return false;
    return true;
  });
}

/** Every screen in order, including the two that are not questions. */
export function screenIds(v: Values): string[] {
  return [...applicableSteps(v).map(s => s.id), 'done'];
}

export function stepById(id: string): Step | undefined {
  return STEPS.find(s => s.id === id);
}

/** Position of a screen for the progress bar: 1-based, review counts as last. */
export function progress(v: Values, screen: string) {
  const steps = applicableSteps(v);
  const total = steps.length;
  const num = steps.findIndex(s => s.id === screen) + 1;
  return { num, total, pct: Math.round((num / total) * 100) };
}

export function t(txt: Txt | undefined, lang: Lang): string {
  return txt ? txt[lang] || txt.en : '';
}

// Answers are stored as stable English keys so the office can query them, but
// they must never be *shown* that way: a Kiswahili visitor who met no English
// for fifteen screens should not meet it on the sixteenth.
const CHIP_LABELS: Record<string, Record<string, Txt>> = {
  gender: { Male: UI.male, Female: UI.female },
  age: { 'Under 18': UI.a18, '19–35': UI.a19, '36–44': UI.a36, '45+': UI.a45 },
  marital: { Single: UI.m1, Married: UI.m2, Widowed: UI.m3, Separated: UI.m4 },
  occ: { Student: UI.occStudy, Professional: UI.occWork },
  stay: {
    'Just today': UI.s1, 'A few days': UI.s2, 'A week or so': UI.s3,
    'A few weeks': UI.s4, Months: UI.s5, 'Moving here': UI.s6,
  },
  often: {
    'First time': UI.o1, 'Every week': UI.o2, Monthly: UI.o3, 'Few times a year': UI.o4,
  },
};

/**
 * A stored yyyy-mm-dd as the visitor would write it, using the same month
 * names the date wheel showed them. Intl would do this too, but it would use
 * its own Swahili month spellings rather than the ones on the wheel.
 */
export function formatDob(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = UI.months[lang][Number(m[2]) - 1];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** The visitor-facing label for a stored answer, in their language. */
export function labelOf(field: string, value: string, lang: Lang): string {
  const chip = CHIP_LABELS[field]?.[value];
  if (chip) return t(chip, lang);

  // Through stepGroups, so a question that shares a screen with another is
  // still found. Looking only at step.key would leave the answers to every
  // grouped question showing in raw English.
  for (const step of STEPS) {
    for (const g of stepGroups(step)) {
      if (g.key !== field) continue;
      const hit = g.opts.find(o => o.val === value);
      if (hit) return t(hit.label, lang);
    }
  }

  const byId = STEPS.find(s => s.id === field);
  const opt = byId?.opts?.find(o => o.val === value);
  return opt ? t(opt.label, lang) : value;
}

export function firstName(v: Values): string {
  return (v.fullname || '').trim().split(/\s+/)[0] || '';
}

/** Substitutes {name} and {phone}, and tidies the gap a missing name leaves. */
export function fill(str: string, v: Values): string {
  const name = firstName(v);
  let out = str || '';

  if (name) {
    out = out.split('{name}').join(name);
  } else {
    // No name yet, which happens whenever someone walks back past the screen
    // that asks for it. Take the comma that was there to set the name off along
    // with it, so "Karibu, {name}." greets them with "Karibu." and not
    // "Karibu," left hanging.
    out = out
      .replace(/,\s*\{name\}/g, '')
      .replace(/\s*\{name\}\s*,/g, ',')
      .replace(/\s*\{name\}/g, '');
  }

  return out
    .split('{phone}').join(`${v.dial} ${v.phone || '...'}`)
    .replace(/^\s*,\s*/, '')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
