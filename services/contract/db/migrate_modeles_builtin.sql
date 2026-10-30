-- Modèles de contrats intégrés (globaux, agency_id NULL) — rédaction française, droit marocain.
--
-- Contenu INLINE et non dans des fichiers HTML voisins : `infra/prod/deploy-remote.sh` pipe
-- chaque migration sur l'entrée standard de psql (`psql_stdin < "$f"`), si bien qu'aucune
-- méta-commande `\i` / `\copy` ne pourrait résoudre un chemin relatif de façon fiable côté
-- serveur. Le corps de chaque modèle est donc porté par un littéral dollar-quoté (délimiteurs
-- « nom » et « html »), seul moyen d'écrire des apostrophes françaises sans échappement.
--
-- IDEMPOTENCE : le script est rejoué à chaque déploiement. La clé stable est
-- (agency_id IS NULL, name) ; un modèle déjà présent n'est ni dupliqué ni réécrit, et aucune
-- modification faite par une agence sur ses propres modèles (agency_id NOT NULL) n'est touchée.
-- Pour publier une nouvelle version d'un modèle, créer une entrée sous un nouveau `name`.

WITH modeles(document_type, name, body_html) AS (
VALUES
  ('lease', $nom$Bail à usage d'habitation (loi 67-12)$nom$, $html$
<h1 style="text-align: center">CONTRAT DE BAIL À USAGE D'HABITATION</h1>
<p style="text-align: center"><strong>Établi conformément à la loi n° 67-12 relative à l'organisation des rapports contractuels entre le bailleur et le locataire des locaux à usage d'habitation ou professionnel</strong></p>
<p style="text-align: center">Dossier n° {{property_reference}} — Fait à {{property_city}}, le {{date}}</p>

<h2>ENTRE LES SOUSSIGNÉS</h2>

<h3>Article 1 — Les parties</h3>
<p><strong>D'une part, le ou les bailleurs :</strong></p>
<p>{{parties_bailleurs}}</p>
<p>Ci-après désigné(s) « <strong>le bailleur</strong> », ce terme s'entendant de l'ensemble des personnes ci-dessus lorsqu'elles sont plusieurs, qu'elles agissent en qualité de propriétaires indivis, de copropriétaires, d'héritiers dans une indivision successorale ou de représentants d'une personne morale.</p>
<p><strong>Et d'autre part, le ou les locataires :</strong></p>
<p>{{parties_locataires}}</p>
<p>Ci-après désigné(s) « <strong>le locataire</strong> », ce terme s'entendant de l'ensemble des personnes ci-dessus lorsqu'elles sont plusieurs, qu'elles occupent les lieux en qualité de conjoints, de colocataires ou de membres d'un même foyer.</p>
<p>Chaque partie déclare être juridiquement capable de contracter et, lorsqu'elle agit pour le compte d'autrui, justifier d'un pouvoir régulier dont une copie demeure annexée aux présentes. Les mentions d'identification de chaque partie — nom et prénom ou dénomination sociale, qualité, nationalité, numéro de la carte nationale d'identité électronique ou du registre de commerce, et domicile — figurent au présent article conformément aux exigences de forme de la loi n° 67-12.</p>
<!-- loi n° 67-12 : le contrat de location est conclu par écrit ayant date certaine et comporte l'identification des parties. Numéro d'article non vérifié (art. 3 selon notre lecture) -->

<h3>Article 2 — Intervention de l'agence</h3>
<p>Le présent contrat est établi par l'intermédiaire de l'agence <strong>{{agency_name}}</strong>, dont le siège est sis {{agency_address}}, identifiant professionnel n° {{agency_license}}, représentée aux présentes par {{agent_name}}.</p>
<p>L'agence intervient en qualité d'intermédiaire et, le cas échéant, de mandataire du bailleur en vertu d'un mandat de gestion locative distinct. Elle n'est pas partie au bail et ne se porte garante ni du paiement des loyers ni de l'exécution des obligations des parties, sauf stipulation expresse et écrite contraire.</p>

<h2>IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT</h2>

<h3>Article 3 — Objet et désignation des lieux loués</h3>
<p>Le bailleur donne à bail au locataire, qui l'accepte, le bien immobilier à usage d'habitation ci-après désigné :</p>
<table>
<tbody>
<tr><th>Nature du bien</th><td>{{property_type}}</td></tr>
<tr><th>Adresse</th><td>{{property_address}}</td></tr>
<tr><th>Ville</th><td>{{property_city}}</td></tr>
<tr><th>Surface</th><td>{{property_surface}}</td></tr>
<tr><th>Nombre de pièces principales</th><td>{{property_rooms}}</td></tr>
<tr><th>Étage et numéro d'appartement</th><td>……………………</td></tr>
<tr><th>Titre foncier ou référence cadastrale</th><td>……………………</td></tr>
<tr><th>Référence du bien</th><td>{{property_reference}}</td></tr>
</tbody>
</table>
<p>Les lieux loués comprennent en outre les dépendances suivantes : ……………………………………………… (cave, box, place de stationnement n° ………, terrasse, jardin, buanderie), ainsi que l'usage des parties communes de l'immeuble dans les conditions fixées par le règlement de copropriété.</p>
<p>Le bien est loué : <strong>non meublé</strong> / <strong>meublé</strong> (rayer la mention inutile). S'il est loué meublé, l'inventaire du mobilier et des équipements, signé par les parties, est annexé au présent contrat et en fait partie intégrante.</p>
<p>Le locataire déclare avoir visité les lieux, les avoir trouvés conformes à ses besoins et renoncer à toute réclamation quant à leur consistance, leur superficie exacte ou leur agencement, sous réserve des vices cachés et des désordres constatés à l'état des lieux d'entrée.</p>

<h3>Article 4 — Destination des lieux</h3>
<p>Les lieux sont loués pour un usage <strong>exclusif d'habitation</strong>. Le locataire ne pourra, sans l'accord écrit et préalable du bailleur, y exercer une activité commerciale, industrielle, artisanale ou professionnelle, ni y domicilier le siège d'une société, ni en changer la destination.</p>
<p>Tout changement de destination non autorisé constitue un manquement grave au présent contrat et peut fonder sa résiliation dans les conditions de l'article 23 ci-dessous. En particulier, il est expressément interdit au locataire de proposer tout ou partie des lieux à la location de courte durée, meublée ou touristique, par quelque canal que ce soit.</p>

<h3>Article 5 — Durée du bail</h3>
<p>Le présent bail est consenti pour une durée de <strong>……………………</strong> (…………………… mois ou années), prenant effet le <strong>……………………</strong> pour se terminer le <strong>……………………</strong>.</p>
<p>La remise des clés au locataire intervient le …………………… et vaut mise à disposition effective des lieux.</p>

<h3>Article 6 — Renouvellement et reconduction</h3>
<p>À l'expiration de la durée convenue, le bail se renouvelle par tacite reconduction pour des périodes successives de même durée, aux mêmes clauses et conditions, sauf dénonciation régulière par l'une des parties dans les formes et délais prévus aux articles 21 et 22 ci-dessous.</p>
<p>La reconduction n'opère pas novation : elle laisse subsister l'intégralité des stipulations du présent contrat, y compris les sûretés et garanties qui l'accompagnent.</p>
<!-- loi n° 67-12 : le bail d'habitation se poursuit au-delà du terme convenu à défaut de congé régulièrement notifié -->

<h3>Article 7 — Loyer</h3>
<p>Le loyer mensuel est fixé, d'un commun accord entre les parties, à la somme de <strong>…………………… DH</strong> (…………………………………………… dirhams), hors charges.</p>
<p>Ce loyer a été librement débattu entre les parties en considération de la consistance du bien, de sa situation et de l'état du marché locatif local. Il est payable d'avance, au plus tard le …………………… de chaque mois, pour le mois à échoir.</p>
<p>Le premier terme, éventuellement calculé au prorata du nombre de jours d'occupation du premier mois, s'élève à …………………… DH et est réglé à la signature des présentes.</p>

<h3>Article 8 — Modalités de paiement et quittances</h3>
<p>Le loyer et les charges sont payables entre les mains du bailleur ou de son mandataire, à son domicile ou siège, par virement bancaire, prélèvement automatique, chèque ou tout autre moyen de paiement traçable, au compte dont les coordonnées suivent : ………………………………………………………………</p>
<p>Le bailleur ou son mandataire délivre au locataire, pour chaque terme encaissé, une quittance mentionnant la période couverte et la ventilation entre le loyer et les charges. La remise de la quittance ne peut être subordonnée à aucune condition ni à aucun frais.</p>
<p>Le paiement du loyer ne peut être suspendu, réduit ni compensé par le locataire au motif de réclamations relatives à l'état des lieux, aux charges ou aux travaux, sauf décision de justice ou accord écrit du bailleur.</p>
<!-- loi n° 67-12 : obligation pour le bailleur de délivrer au locataire un reçu ou une quittance du loyer encaissé. Numéro d'article non vérifié -->

<h3>Article 9 — Révision du loyer</h3>
<p>Le loyer est révisable dans les conditions, la périodicité et les limites fixées par la <strong>loi n° 07-03 relative à la révision du montant des loyers des locaux à usage d'habitation ou professionnel</strong>, soit, pour les locaux à usage d'habitation, une révision ne pouvant intervenir qu'à l'expiration d'un délai de <strong>trois (3) ans</strong> à compter de la date de conclusion du contrat ou de la dernière révision, et dans la limite d'un taux de <strong>huit pour cent (8 %)</strong> du loyer en vigueur.</p>
<p>La révision n'est pas automatique : elle doit être demandée par le bailleur au locataire par écrit à date certaine. À défaut d'accord, la partie la plus diligente saisit la juridiction compétente.</p>
<p>Toute augmentation convenue hors de ce cadre légal est réputée non écrite, sans que cette nullité partielle n'affecte la validité du reste du contrat.</p>
<!-- loi n° 07-03 sur la révision des loyers : périodicité triennale et plafond de 8 % pour l'habitation (10 % pour l'usage commercial, professionnel ou artisanal). Numéros d'articles non vérifiés -->

<h3>Article 10 — Charges et accessoires</h3>
<p>Outre le loyer, le locataire supporte les charges et prestations suivantes, qui constituent l'accessoire du loyer :</p>
<ul>
<li>les consommations d'eau et d'électricité, dont il fait son affaire personnelle de l'abonnement, du relevé et du règlement auprès du distributeur ;</li>
<li>les abonnements de téléphonie, d'internet et de télévision qu'il contracte en son nom ;</li>
<li>sa quote-part des charges de syndic correspondant aux dépenses d'entretien courant, d'éclairage, de nettoyage des parties communes, d'ascenseur et de gardiennage, soit une provision mensuelle de <strong>…………………… DH</strong> ;</li>
<li>l'enlèvement des ordures ménagères et le menu entretien des équipements mis à sa disposition.</li>
</ul>
<p>Demeurent en revanche à la charge du bailleur les charges de syndic ayant le caractère de dépenses de travaux, de grosses réparations, de réfection ou de remplacement d'équipements communs, ainsi que les appels de fonds exceptionnels décidés par l'assemblée générale des copropriétaires.</p>
<p>La provision pour charges fait l'objet d'une régularisation annuelle sur justificatifs, le trop-perçu étant restitué au locataire et l'insuffisance appelée dans le délai d'un mois suivant la présentation du décompte.</p>

<h3>Article 11 — Impôts et taxes</h3>
<p>Les impôts et taxes frappant la propriété de l'immeuble demeurent à la charge du bailleur. Les taxes et redevances dues à raison de l'occupation ou de la consommation sont à la charge du locataire.</p>
<p>La répartition de la taxe de services communaux et des autres impositions locales s'effectue conformément à la législation fiscale en vigueur ; les parties conviennent, pour la part dont l'imputation n'est pas légalement déterminée, de la répartition suivante : ………………………………………………………………</p>
<!-- Répartition retenue par pratique contractuelle : nous n'avons pas vérifié le texte fiscal attribuant la taxe de services communaux, d'où la ligne à compléter -->

<h3>Article 12 — Dépôt de garantie</h3>
<p>À la garantie de la bonne exécution de ses obligations, et notamment de la restitution des lieux en bon état et du règlement de tous comptes, le locataire verse à la signature des présentes un dépôt de garantie de <strong>…………………… DH</strong>, correspondant à …………………… mois de loyer hors charges, dont le bailleur lui donne quittance.</p>
<p>Ce dépôt ne porte pas intérêt et ne peut en aucun cas être imputé par le locataire sur un terme de loyer, y compris le dernier.</p>
<p>Il est restitué au locataire dans le délai de …………………… suivant la remise des clés et l'établissement de l'état des lieux de sortie, déduction faite, sur justificatifs, des sommes restant dues au titre des loyers, des charges, des réparations locatives et des dégradations constatées.</p>
<p>Lorsque les locataires sont plusieurs, le dépôt de garantie est réputé versé indivisiblement et sa restitution est valablement faite entre les mains de l'un quelconque d'entre eux ou du mandataire qu'ils auront désigné à l'article 20 ci-dessous.</p>
<!-- Aucun plafond légal de dépôt de garantie n'a pu être identifié dans la loi n° 67-12 : le montant et le délai de restitution sont laissés à la convention des parties -->

<h3>Article 13 — État des lieux</h3>
<p>Un état des lieux contradictoire est dressé entre les parties, ou entre leurs mandataires, lors de la remise des clés. Il décrit pièce par pièce l'état des sols, murs, plafonds, menuiseries, installations sanitaires, électriques et de chauffage, ainsi que les relevés des compteurs. Il est signé par les parties et annexé au présent contrat dont il fait partie intégrante.</p>
<p>Un état des lieux de sortie est établi dans les mêmes formes lors de la restitution des clés. La comparaison des deux documents détermine les réparations incombant au locataire, abstraction faite de l'usure normale résultant d'un usage conforme.</p>
<p>À défaut d'état des lieux d'entrée dressé contradictoirement, le locataire est réputé avoir reçu les lieux en bon état de réparations locatives.</p>
<!-- loi n° 67-12 : état des lieux contradictoire annexé au contrat et présomption de bon état à défaut. Numéro d'article non vérifié (art. 4 selon notre lecture) -->

<h3>Article 14 — Obligations du bailleur</h3>
<p>Le bailleur s'oblige à :</p>
<ol>
<li>délivrer les lieux loués en bon état d'usage, de réparation et de salubrité, les équipements mentionnés au contrat étant en état de fonctionnement ;</li>
<li>assurer au locataire la jouissance paisible des lieux pendant toute la durée du bail et le garantir contre les vices et défauts qui en empêchent l'usage ;</li>
<li>entretenir les lieux en état de servir à l'usage prévu et y effectuer toutes les réparations autres que locatives, notamment celles affectant la structure, la toiture, les façades, l'étanchéité et les canalisations encastrées ;</li>
<li>ne pas s'opposer aux aménagements réalisés par le locataire dès lors qu'ils ne constituent pas une transformation des lieux ;</li>
<li>remettre au locataire une copie du présent contrat, de ses annexes et, sur demande, du règlement de copropriété ;</li>
<li>s'acquitter des primes d'assurance et des cotisations de copropriété lui incombant.</li>
</ol>
<p>Lorsque les bailleurs sont plusieurs, ils sont tenus de ces obligations solidairement entre eux à l'égard du locataire.</p>
<!-- loi n° 67-12 et Dahir formant Code des obligations et des contrats : obligations de délivrance, d'entretien et de garantie de jouissance paisible du bailleur -->

<h3>Article 15 — Obligations du locataire</h3>
<p>Le locataire s'oblige à :</p>
<ol>
<li>payer le loyer et les charges aux termes convenus, sans retard ni compensation ;</li>
<li>user paisiblement des lieux suivant la destination qui leur est donnée au contrat, en bon père de famille ;</li>
<li>occuper les lieux personnellement et effectivement, et ne pas les laisser inoccupés de façon prolongée sans en aviser le bailleur ;</li>
<li>répondre des dégradations et pertes survenues pendant la durée du bail dans les lieux dont il a la jouissance, à moins qu'il ne prouve qu'elles ont eu lieu par cas de force majeure, par la faute du bailleur ou par le fait d'un tiers qu'il n'a pas introduit dans les lieux ;</li>
<li>prendre à sa charge l'entretien courant et les réparations locatives, notamment le remplacement des vitres brisées, des joints, des robinetteries, des interrupteurs et des ampoules, le débouchage des canalisations apparentes, l'entretien des installations de chauffage et de climatisation et le ramonage ;</li>
<li>ne faire aucune transformation des lieux ni des équipements sans l'accord écrit et préalable du bailleur ;</li>
<li>respecter le règlement de copropriété, s'abstenir de tout trouble de voisinage, de toute nuisance sonore et de tout entreposage de matières dangereuses, inflammables ou insalubres ;</li>
<li>ne pas détenir dans les lieux d'animaux susceptibles de causer un dommage ou une gêne, et plus généralement se conformer aux usages de l'immeuble ;</li>
<li>laisser visiter les lieux dans les conditions de l'article 19 ;</li>
<li>justifier à toute demande du bailleur du paiement des consommations d'eau et d'électricité et de la souscription de l'assurance prévue à l'article 17 ;</li>
<li>restituer les lieux en fin de bail dans l'état constaté à l'entrée, compte tenu de l'usure normale.</li>
</ol>

<h3>Article 16 — Travaux, réparations et améliorations</h3>
<p>Le locataire doit aviser sans délai le bailleur de tout désordre, fuite, infiltration ou dégradation affectant les lieux et appelant une réparation incombant au bailleur. À défaut d'avis en temps utile, il répond de l'aggravation du dommage.</p>
<p>Le locataire souffre les travaux nécessaires à la conservation de l'immeuble et à la réparation des désordres, sans pouvoir prétendre à indemnité. Toutefois, si les travaux rendent les lieux inhabitables en tout ou partie pendant plus de …………………… jours, une réduction proportionnelle du loyer est convenue entre les parties ou, à défaut, fixée par le juge.</p>
<p>Les aménagements, embellissements et améliorations réalisés par le locataire deviennent, en fin de bail, la propriété du bailleur sans indemnité, sauf convention contraire écrite. Le bailleur peut néanmoins exiger la remise en l'état antérieur aux frais du locataire lorsque les travaux ont été réalisés sans son accord.</p>

<h3>Article 17 — Assurances</h3>
<p>Le locataire s'engage à souscrire, dès son entrée dans les lieux et pour toute la durée du bail, une police d'assurance couvrant sa responsabilité locative, notamment les risques d'incendie, d'explosion, de dégâts des eaux et de recours des voisins et des tiers. Il en justifie au bailleur à la signature des présentes puis à chaque échéance annuelle, sur simple demande.</p>
<p>Le bailleur conserve à sa charge l'assurance de l'immeuble et de sa propre responsabilité de propriétaire.</p>
<p>Les parties renoncent réciproquement à tout recours au-delà des garanties de leurs assureurs respectifs, dans la limite des sommes effectivement indemnisées.</p>
<!-- Clause de pratique contractuelle : nous n'avons pas identifié d'obligation légale d'assurance du locataire en droit marocain -->

<h3>Article 18 — Cession et sous-location</h3>
<p>Il est fait interdiction au locataire de céder son droit au bail, en tout ou partie, à titre gratuit ou onéreux, et de sous-louer les lieux, sans l'accord écrit, préalable et exprès du bailleur.</p>
<p>En cas de sous-location régulièrement autorisée, le locataire principal demeure personnellement tenu de l'intégralité de ses obligations et répond des agissements du sous-locataire comme des siens. L'autorisation donnée pour une sous-location ne vaut pas pour une autre.</p>
<p>Toute cession ou sous-location consentie en violation du présent article est inopposable au bailleur et constitue un manquement grave fondant la résiliation du bail.</p>

<h3>Article 19 — Visites et accès aux lieux</h3>
<p>Le locataire laisse visiter les lieux par le bailleur, son mandataire, les entreprises mandatées ou les candidats acquéreurs et locataires, sur rendez-vous pris au moins …………………… heures à l'avance, deux heures par jour les jours ouvrables, à l'exclusion des jours fériés.</p>
<p>Cette obligation ne confère au bailleur aucun droit d'accès sans l'accord du locataire ni en son absence, hors le cas d'urgence tenant à la sécurité des personnes ou à la conservation de l'immeuble.</p>

<h3>Article 20 — Pluralité de parties — solidarité et indivisibilité</h3>
<p>Lorsque le locataire est constitué de plusieurs personnes, celles-ci sont tenues <strong>solidairement et indivisiblement</strong> de l'ensemble des obligations nées du présent bail, notamment du paiement des loyers, des charges, des réparations et des indemnités. Le bailleur peut en conséquence réclamer à l'un quelconque des colocataires la totalité des sommes dues, sans que celui-ci puisse opposer une division de la dette.</p>
<p>Le départ, le décès ou la défaillance de l'un des colocataires ne libère ni les autres, ni ses héritiers ou ayants cause, qui demeurent tenus dans les mêmes termes jusqu'au terme du bail ou, en cas de reconduction, jusqu'à la résiliation régulière de celui-ci. La libération d'un colocataire ne peut résulter que d'un avenant écrit signé par le bailleur.</p>
<p>Lorsque le bailleur est constitué de plusieurs personnes, celles-ci sont également tenues solidairement de leurs obligations à l'égard du locataire. Elles désignent, pour la réception des loyers et des notifications, un mandataire commun en la personne de …………………… ; à défaut, toute notification valablement faite à l'un d'eux est réputée faite à tous.</p>
<p>Les colocataires désignent de même, pour la réception des notifications, un mandataire commun en la personne de …………………… ; à défaut, toute notification valablement faite à l'un d'eux est réputée faite à tous.</p>
<!-- Dahir formant Code des obligations et des contrats, art. 164 et suivants : la solidarité ne se présume pas et doit être expressément stipulée, d'où la présente clause -->

<h3>Article 21 — Résiliation à l'initiative du locataire</h3>
<p>Le locataire peut mettre fin au bail à tout moment, en avisant le bailleur par écrit à date certaine, moyennant un préavis de <strong>…………………… mois</strong> courant à compter de la réception de l'avis.</p>
<p>Le loyer et les charges demeurent dus pendant toute la durée du préavis, que les lieux soient occupés ou non, sauf relocation effective anticipée acceptée par le bailleur.</p>
<p>Lorsque les locataires sont plusieurs, la dénonciation n'est valable que si elle émane de tous, ou de l'un d'eux agissant en vertu d'un pouvoir écrit des autres.</p>
<!-- Durée du préavis du locataire laissée à la convention des parties : nous n'avons pas pu identifier avec certitude le délai fixé par la loi n° 67-12 pour le congé donné par le locataire -->

<h3>Article 22 — Résiliation à l'initiative du bailleur</h3>
<p>Le bailleur qui entend mettre fin au bail notifie son intention au locataire <strong>par voie d'huissier de justice</strong>, au moins <strong>trois (3) mois</strong> avant la date d'effet souhaitée, en indiquant le motif du congé.</p>
<p>Le congé ne peut être fondé que sur l'un des motifs admis par la loi n° 67-12, notamment la reprise des lieux pour l'habitation personnelle du bailleur, de son conjoint, de ses ascendants ou descendants, la démolition et la reconstruction de l'immeuble, la réalisation de travaux rendant les lieux inhabitables, ou le manquement du locataire à ses obligations contractuelles.</p>
<p>Le locataire dispose, à compter de la notification, des voies de contestation et, le cas échéant, des droits à indemnité prévus par la loi. L'exécution du congé contesté ne peut résulter que d'une décision de justice.</p>
<!-- loi n° 67-12 : le congé du bailleur est notifié par huissier de justice au moins trois mois avant la date d'effet, avec indication du motif. Numéro d'article non vérifié -->

<h3>Article 23 — Défaut de paiement et clause résolutoire</h3>
<p>À défaut de paiement d'un seul terme de loyer ou de charges à son échéance, le bailleur met le locataire en demeure de régulariser <strong>par voie d'huissier de justice</strong>. Faute de paiement intégral dans le délai de <strong>quinze (15) jours</strong> à compter de la réception de la mise en demeure, le bailleur peut saisir la juridiction compétente aux fins de validation du congé, de résiliation du bail et d'expulsion.</p>
<p>La même procédure est applicable en cas d'inexécution par le locataire de l'une quelconque de ses autres obligations essentielles, notamment le changement de destination des lieux, la sous-location non autorisée, le défaut d'assurance, les troubles de voisinage caractérisés ou les dégradations volontaires.</p>
<p>La résiliation du bail ne dispense pas le locataire du paiement des sommes échues, des indemnités d'occupation jusqu'à la restitution effective des clés, ni des frais de procédure et de recouvrement légalement exigibles.</p>
<!-- loi n° 67-12 : mise en demeure par huissier et délai de quinze jours en cas de défaut de paiement du loyer. Numéro d'article non vérifié -->

<h3>Article 24 — Restitution des lieux</h3>
<p>À l'expiration du bail, pour quelque cause que ce soit, le locataire restitue les lieux libres de toute occupation, vidés de tous objets et meubles lui appartenant, en bon état de réparations locatives, et remet l'ensemble des clés, badges et télécommandes entre les mains du bailleur ou de son mandataire, contre récépissé.</p>
<p>Il justifie du paiement de ses consommations d'eau et d'électricité et de la résiliation de ses abonnements, ou du transfert régulier de ceux-ci.</p>
<p>Tout maintien dans les lieux après la date d'effet de la résiliation donne lieu, sans préjudice de l'action en expulsion, au paiement d'une indemnité d'occupation égale au loyer et aux charges, due jour par jour.</p>

<h3>Article 25 — Enregistrement et droits de timbre</h3>
<p>Le présent contrat est soumis aux formalités d'enregistrement dans les conditions, les délais et aux tarifs prévus par le <strong>Code général des impôts</strong>, la présentation à l'enregistrement devant intervenir dans le délai de <strong>trente (30) jours</strong> suivant la date de l'acte.</p>
<p>Les droits d'enregistrement et de timbre, dont le montant s'élève à …………………… DH, sont supportés par …………………… (le locataire / le bailleur / par moitié entre les parties).</p>
<p>La partie qui accomplit la formalité en remet une copie à l'autre. Le défaut d'enregistrement n'affecte pas la validité du contrat entre les parties mais expose la partie qui en avait la charge aux pénalités fiscales applicables.</p>
<!-- Code général des impôts : obligation d'enregistrement des actes et délai de trente jours. Tarifs et répartition laissés en blanc, les taux applicables aux baux n'ayant pas été vérifiés -->

<h3>Article 26 — Élection de domicile et notifications</h3>
<p>Pour l'exécution des présentes, chaque partie élit domicile à l'adresse figurant à l'article 1. Tout changement d'adresse doit être notifié à l'autre partie par écrit à date certaine dans le délai de quinze jours ; à défaut, les notifications faites à l'adresse élue sont réputées valablement reçues.</p>
<p>Les notifications requérant une date certaine sont faites par acte d'huissier de justice ou par lettre recommandée avec accusé de réception. Les échanges courants peuvent intervenir par tout moyen écrit, y compris électronique, aux adresses suivantes : {{client_email}} et {{client_phone}} pour le locataire, et celles indiquées à l'article 1 pour le bailleur.</p>

<h3>Article 27 — Médiation et juridiction compétente</h3>
<p>En cas de différend relatif à la formation, à l'interprétation, à l'exécution ou à la rupture du présent contrat, les parties s'efforcent de parvenir à un règlement amiable, le cas échéant par la voie d'une médiation conventionnelle conduite dans les conditions prévues par la <strong>loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle</strong>, et dont la durée ne saurait excéder …………………… jours.</p>
<p>À défaut de règlement amiable, le litige relève de la compétence du tribunal de première instance du lieu de situation de l'immeuble, auquel les parties attribuent expressément compétence.</p>
<p>La tentative de médiation ne fait pas obstacle aux mesures conservatoires et aux procédures d'urgence.</p>
<!-- loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle ; compétence territoriale du lieu de situation de l'immeuble -->

<h3>Article 28 — Annexes</h3>
<p>Font partie intégrante du présent contrat :</p>
<ul>
<li>l'état des lieux d'entrée, signé des parties ;</li>
<li>l'inventaire du mobilier, en cas de location meublée ;</li>
<li>la copie des pièces d'identité ou des documents d'immatriculation de chaque partie ;</li>
<li>la copie des pouvoirs des représentants et, le cas échéant, de l'acte d'hérédité ou de l'acte de partage justifiant la qualité des cobailleurs ;</li>
<li>l'attestation d'assurance du locataire ;</li>
<li>le règlement de copropriété ou l'extrait des dispositions applicables à l'occupant ;</li>
<li>…………………………………………………………………</li>
</ul>

<h3>Article 29 — Dispositions finales</h3>
<p>Le présent contrat exprime l'intégralité de l'accord des parties et remplace tout échange, offre ou engagement antérieur portant sur le même objet. Il ne peut être modifié que par avenant écrit signé de toutes les parties.</p>
<p>La nullité, l'illicéité ou l'inopposabilité d'une stipulation n'affecte pas la validité des autres, qui demeurent pleinement applicables. Toute clause contraire aux dispositions impératives de la loi n° 67-12 est réputée non écrite et remplacée de plein droit par la disposition légale correspondante.</p>
<p>Le fait pour une partie de ne pas se prévaloir d'un manquement de l'autre ne vaut pas renonciation à s'en prévaloir ultérieurement.</p>
<p>Le présent contrat est établi en autant d'originaux qu'il y a de parties, plus un exemplaire destiné à la formalité de l'enregistrement et un exemplaire destiné à l'agence, chaque partie reconnaissant avoir reçu le sien.</p>

<h2 style="text-align: center">SIGNATURES</h2>
<p>Fait à {{property_city}}, le {{date}}.</p>
<p>Chaque partie paraphe chacune des pages du présent contrat et de ses annexes, et fait précéder sa signature de la mention manuscrite « lu et approuvé ».</p>
<table>
<thead>
<tr><th style="text-align: center">Le ou les bailleurs</th><th style="text-align: center">Le ou les locataires</th></tr>
</thead>
<tbody>
<tr>
<td>Nom : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Signature :<br><br></td>
<td>Nom : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Signature :<br><br></td>
</tr>
</tbody>
</table>
<p><em>Ajouter autant de blocs de signature que de parties.</em></p>
<p>Pour l'agence {{agency_name}}, {{agent_name}} : ……………………</p>
$html$),
  ('mandate_rental', $nom$Mandat de gestion locative (gérance)$nom$, $html$
<h1 style="text-align: center">MANDAT DE GESTION LOCATIVE</h1>
<p style="text-align: center"><strong>Contrat de gérance d'immeuble consenti à un intermédiaire immobilier</strong></p>
<p style="text-align: center">Référence du bien : {{property_reference}} — Fait à {{property_city}}, le {{date}}</p>

<h2>ENTRE LES SOUSSIGNÉS</h2>

<h3>Article 1 — Le ou les mandants</h3>
<p>{{parties_mandants}}</p>
<p>Ci-après désigné(s) « <strong>le mandant</strong> », ce terme s'entendant de l'ensemble des personnes ci-dessus lorsqu'elles sont plusieurs, qu'elles agissent en qualité de propriétaires indivis, de copropriétaires, d'héritiers dans une indivision successorale, d'usufruitier et de nu-propriétaire, ou de représentants d'une personne morale.</p>
<p>Chaque mandant déclare être propriétaire ou titulaire du droit de donner à bail le bien désigné à l'article 3, être juridiquement capable de contracter et, lorsqu'il agit pour le compte d'autrui ou d'une indivision, justifier d'un pouvoir régulier dont une copie demeure annexée aux présentes.</p>

<h3>Article 2 — Le mandataire</h3>
<p>L'agence <strong>{{agency_name}}</strong>, dont le siège est sis {{agency_address}}, identifiant professionnel n° {{agency_license}}, représentée aux présentes par {{agent_name}}, dûment habilité à l'effet des présentes.</p>
<p>Ci-après désignée « <strong>le mandataire</strong> » ou « <strong>l'agence</strong> ».</p>
<p>Le mandataire déclare exercer l'activité d'intermédiation et de gestion immobilière, disposer des moyens humains et matériels nécessaires à l'exécution du présent mandat et tenir une comptabilité distincte des fonds reçus pour le compte de ses mandants.</p>

<h2>IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT</h2>

<h3>Article 3 — Objet du mandat et désignation du bien</h3>
<p>Le mandant confie au mandataire, qui l'accepte, la gestion locative du bien immobilier ci-après désigné :</p>
<table>
<tbody>
<tr><th>Nature du bien</th><td>{{property_type}}</td></tr>
<tr><th>Adresse</th><td>{{property_address}}</td></tr>
<tr><th>Ville</th><td>{{property_city}}</td></tr>
<tr><th>Surface</th><td>{{property_surface}}</td></tr>
<tr><th>Nombre de pièces principales</th><td>{{property_rooms}}</td></tr>
<tr><th>Étage et numéro</th><td>……………………</td></tr>
<tr><th>Titre foncier ou référence cadastrale</th><td>……………………</td></tr>
<tr><th>Référence interne</th><td>{{property_reference}}</td></tr>
</tbody>
</table>
<p>Le mandat porte également sur les dépendances suivantes : ……………………………………………… Il s'étend, sauf stipulation contraire, à l'ensemble des lots appartenant au mandant dans le même immeuble et énumérés en annexe.</p>
<p>Le présent mandat est un <strong>mandat de gérance</strong> régi par les dispositions du Dahir formant Code des obligations et des contrats relatives au mandat, et par les stipulations qui suivent.</p>
<!-- Dahir formant Code des obligations et des contrats, art. 879 et suivants : régime du mandat. Numéro d'article non vérifié au-delà du chapitre -->

<h3>Article 4 — Étendue des pouvoirs du mandataire</h3>
<p>Le mandant donne au mandataire pouvoir, en son nom et pour son compte, de :</p>
<ol>
<li>rechercher des locataires, diffuser l'annonce du bien, organiser les visites et sélectionner les candidats sur la base de critères objectifs de solvabilité ;</li>
<li>constituer le dossier du candidat, en vérifier les pièces et recueillir les garanties éventuelles ;</li>
<li>négocier, rédiger, signer et, le cas échéant, faire enregistrer les contrats de bail à usage d'habitation ou professionnel relatifs au bien, aux conditions minimales fixées à l'article 5 ;</li>
<li>établir les états des lieux d'entrée et de sortie, et les inventaires du mobilier ;</li>
<li>encaisser les loyers, les charges, les dépôts de garantie et toutes sommes dues par les locataires, et en délivrer quittance ;</li>
<li>régler, sur les fonds du mandant, les charges de copropriété, les primes d'assurance, les abonnements, les impôts et taxes et les factures de travaux relevant du propriétaire ;</li>
<li>faire exécuter les travaux d'entretien et les réparations incombant au mandant dans la limite fixée à l'article 7 ;</li>
<li>réviser les loyers dans les conditions et limites de la loi n° 07-03, après information du mandant ;</li>
<li>adresser aux locataires les mises en demeure, relances et lettres de recouvrement, et notifier les congés sur instruction écrite du mandant ;</li>
<li>représenter le mandant auprès du syndic de copropriété, des administrations, des concessionnaires de réseaux et des compagnies d'assurance ;</li>
<li>engager, avec l'accord écrit préalable du mandant, toute action judiciaire en recouvrement, en résiliation de bail ou en expulsion, et constituer avocat et huissier à cet effet ;</li>
<li>établir les comptes de gérance et les documents nécessaires aux déclarations fiscales du mandant.</li>
</ol>
<p>Le mandataire ne peut, sans pouvoir spécial et écrit du mandant, vendre le bien, le grever d'une sûreté réelle, consentir un bail commercial ou un bail de longue durée, transiger, renoncer à un droit, ni se porter contrepartie.</p>

<h3>Article 5 — Conditions de location imposées par le mandant</h3>
<p>Le mandataire conclut les baux dans le respect des conditions minimales suivantes, dont il ne peut s'écarter sans accord écrit du mandant :</p>
<table>
<tbody>
<tr><th>Loyer mensuel minimum hors charges</th><td>…………………… DH</td></tr>
<tr><th>Provision mensuelle pour charges</th><td>…………………… DH</td></tr>
<tr><th>Dépôt de garantie exigé</th><td>…………………… mois de loyer</td></tr>
<tr><th>Durée du bail</th><td>……………………</td></tr>
<tr><th>Destination</th><td>Habitation exclusive / usage professionnel</td></tr>
<tr><th>Location meublée</th><td>Oui / Non</td></tr>
<tr><th>Garanties exigées du locataire</th><td>……………………</td></tr>
</tbody>
</table>
<p>Le prix de présentation du bien à la location est fixé à {{property_price}}. Toute location consentie à des conditions inférieures aux minima ci-dessus engage la responsabilité du mandataire, sauf autorisation écrite préalable.</p>

<h3>Article 6 — Durée du mandat et reconduction</h3>
<p>Le présent mandat est consenti pour une durée de <strong>…………………… mois</strong>, prenant effet le …………………… pour se terminer le ……………………</p>
<p>Il se renouvelle par tacite reconduction pour des périodes successives de même durée, sans que la durée totale puisse excéder …………………… années, sauf dénonciation par l'une des parties dans les conditions de l'article 15.</p>
<p>Le mandat prend fin de plein droit par la vente du bien, sous réserve de l'achèvement des opérations de gérance en cours et du respect des baux en vigueur, par le décès ou l'incapacité du mandant lorsque ses ayants droit ne le confirment pas, et par la cessation d'activité du mandataire.</p>

<h3>Article 7 — Travaux et dépenses</h3>
<p>Le mandataire peut engager, sans autorisation préalable, les dépenses d'entretien courant et les réparations urgentes nécessaires à la conservation du bien ou à la sécurité des occupants, dans la limite de <strong>…………………… DH</strong> par intervention et de <strong>…………………… DH</strong> par année de gestion.</p>
<p>Au-delà de ces seuils, et pour toute dépense non urgente, le mandataire recueille l'accord écrit du mandant après lui avoir soumis au moins …………………… devis.</p>
<p>Les dépenses engagées sont prélevées sur les loyers encaissés. Si le solde du compte du mandant est insuffisant, le mandant s'engage à provisionner le compte dans le délai de …………………… jours suivant l'appel de fonds du mandataire ; à défaut, le mandataire est délié de l'obligation de faire exécuter les travaux et n'encourt aucune responsabilité du fait de leur non-réalisation.</p>
<p>Le mandataire justifie de chaque dépense par une facture établie au nom du mandant et annexée au compte rendu de gestion.</p>

<h3>Article 8 — Encaissements, compte du mandant et reversements</h3>
<p>Le mandataire encaisse les loyers et les charges et les inscrit au crédit d'un compte ouvert au nom du mandant dans sa comptabilité, distinct de ses fonds propres et des comptes de ses autres mandants.</p>
<p>Il reverse au mandant le solde disponible, déduction faite de ses honoraires et des dépenses réglées pour son compte, selon la périodicité suivante : <strong>……………………</strong> (mensuelle / trimestrielle), au plus tard le …………………… de la période suivante, par virement au compte bancaire ci-après : ………………………………………………………………</p>
<p>Les dépôts de garantie encaissés auprès des locataires sont conservés par le mandataire pour le compte du mandant et restitués aux locataires dans les conditions du bail, sauf instruction écrite contraire du mandant.</p>
<p>Le mandataire ne garantit pas le paiement des loyers. Il n'est pas tenu de reverser des sommes qu'il n'a pas encaissées et n'assume aucune obligation de résultat quant à la solvabilité des locataires, sauf souscription d'une garantie des loyers impayés expressément stipulée à l'article 12.</p>

<h3>Article 9 — Compte rendu de gestion</h3>
<p>Le mandataire rend compte de sa gestion au mandant selon la périodicité convenue à l'article 8. Le compte rendu de gestion détaille, pour la période écoulée :</p>
<ul>
<li>les loyers et charges appelés, encaissés et restant dus, locataire par locataire ;</li>
<li>les dépenses réglées pour le compte du mandant, avec les justificatifs correspondants ;</li>
<li>les honoraires prélevés et leur base de calcul ;</li>
<li>le solde reversé et le solde reporté ;</li>
<li>l'état des dépôts de garantie détenus ;</li>
<li>les incidents de paiement, les procédures en cours et les travaux programmés.</li>
</ul>
<p>Le mandant dispose d'un délai de …………………… jours à compter de la réception du compte rendu pour formuler ses observations. Passé ce délai, le compte rendu est réputé approuvé, sans que cette approbation ne couvre une erreur, une omission ou une faute du mandataire révélée ultérieurement.</p>
<p>À l'expiration du mandat, le mandataire établit un compte rendu final et remet au mandant l'ensemble des originaux des baux, états des lieux, quittances et pièces comptables.</p>
<!-- Dahir formant Code des obligations et des contrats : obligation de reddition de comptes du mandataire. Numéro d'article non vérifié -->

<h3>Article 10 — Honoraires du mandataire</h3>
<p>En rémunération de sa mission de gestion courante, le mandataire perçoit des honoraires fixés à <strong>{{commission_rate}}</strong> des loyers et charges effectivement encaissés, soit un taux de …………………… % à défaut d'indication, hors taxes.</p>
<p>Ces honoraires sont prélevés directement sur les encaissements, à chaque reversement, et figurent au compte rendu de gestion.</p>
<p>S'y ajoutent, le cas échéant, les honoraires suivants :</p>
<table>
<tbody>
<tr><th>Honoraires de première location ou de relocation</th><td>…………………… (exprimés en mois de loyer ou en pourcentage du loyer annuel)</td></tr>
<tr><th>Établissement de l'état des lieux</th><td>…………………… DH</td></tr>
<tr><th>Suivi de travaux au-delà de …………… DH</th><td>…………………… % du montant des travaux</td></tr>
<tr><th>Gestion d'un sinistre ou d'un contentieux</th><td>…………………… DH</td></tr>
<tr><th>Établissement du compte rendu fiscal annuel</th><td>…………………… DH</td></tr>
</tbody>
</table>
<p>Tous les montants ci-dessus s'entendent hors taxes et sont majorés de la taxe sur la valeur ajoutée au taux en vigueur, soit le taux normal de vingt pour cent (20 %) à la date des présentes.</p>
<p>Les honoraires de relocation ne sont dus qu'en cas de conclusion effective d'un nouveau bail. Aucun honoraire n'est dû au titre d'une période pendant laquelle le bien est resté vacant, hors les frais de commercialisation expressément convenus.</p>
<!-- Code général des impôts : taxe sur la valeur ajoutée, taux normal de 20 %. Numéro d'article non vérifié -->

<h3>Article 11 — Obligations du mandataire</h3>
<p>Le mandataire s'oblige à :</p>
<ol>
<li>exécuter le mandat personnellement, avec la diligence d'un professionnel avisé, et s'abstenir de se substituer un tiers sans l'accord écrit du mandant, hors les prestataires techniques qu'il demeure chargé de surveiller ;</li>
<li>agir dans les limites des pouvoirs qui lui sont conférés et solliciter l'accord du mandant pour tout acte excédant ceux-ci ;</li>
<li>rendre compte de sa gestion et restituer sans délai les sommes et pièces appartenant au mandant ;</li>
<li>conserver les fonds du mandant sur un compte distinct et ne jamais les confondre avec ses fonds propres ;</li>
<li>informer sans délai le mandant de tout impayé, sinistre, litige, congé, désordre affectant le bien ou événement susceptible d'affecter sa valeur ou sa location ;</li>
<li>vérifier, avant la conclusion de chaque bail, l'identité et les capacités du candidat locataire, et conserver les justificatifs produits ;</li>
<li>respecter la confidentialité des informations relatives au mandant et traiter les données personnelles des locataires et du mandant conformément à la législation applicable à la protection des données à caractère personnel ;</li>
<li>souscrire et maintenir une assurance de responsabilité civile professionnelle couvrant les conséquences pécuniaires de ses fautes dans l'exercice du présent mandat, dont il justifie sur simple demande.</li>
</ol>

<h3>Article 12 — Obligations du mandant</h3>
<p>Le mandant s'oblige à :</p>
<ol>
<li>remettre au mandataire, à la signature des présentes, les titres de propriété, le règlement de copropriété, les attestations d'assurance, les derniers avis d'imposition, les relevés de charges, les diagnostics techniques disponibles et les clés du bien ;</li>
<li>garantir au mandataire la libre disposition du bien aux fins de location et l'absence de tout droit de tiers y faisant obstacle ;</li>
<li>maintenir le bien en état de servir à l'usage auquel il est destiné et faire exécuter les travaux qui lui incombent ;</li>
<li>souscrire et maintenir une assurance propriétaire non occupant couvrant l'immeuble et sa responsabilité ;</li>
<li>provisionner le compte de gestion lorsque les encaissements sont insuffisants pour régler les dépenses autorisées ;</li>
<li>informer le mandataire de tout changement affectant sa situation, son adresse, ses coordonnées bancaires, la propriété du bien ou la composition de l'indivision ;</li>
<li>répondre des conséquences des instructions qu'il donne au mandataire, lorsque celui-ci l'a préalablement alerté par écrit des risques qu'elles comportent ;</li>
<li>payer les honoraires convenus à l'article 10.</li>
</ol>
<p>Une garantie des loyers impayés est souscrite : <strong>Oui / Non</strong>. Si oui, auprès de …………………… , pour une prime annuelle de …………………… DH supportée par …………………… , dans les conditions et sous les exclusions de la police annexée aux présentes.</p>

<h3>Article 13 — Pluralité de mandants — solidarité et mandataire commun</h3>
<p>Lorsque le mandant est constitué de plusieurs personnes, celles-ci sont tenues <strong>solidairement et indivisiblement</strong> de l'ensemble des obligations nées du présent mandat, notamment du paiement des honoraires, du remboursement des dépenses avancées et des conséquences des instructions données.</p>
<p>Les comandants donnent au présent mandat leur accord conjoint. Ils désignent, pour recevoir les comptes rendus et les reversements, exercer les options et donner au mandataire toute instruction, un mandataire commun en la personne de <strong>……………………</strong>, dont les décisions les engagent tous.</p>
<p>À défaut de désignation d'un mandataire commun, toute notification valablement faite à l'un d'eux est réputée faite à tous, et le mandataire est fondé à s'en tenir aux instructions écrites concordantes de la majorité des quotes-parts indivises, sans avoir à arbitrer leurs divergences.</p>
<p>Les reversements sont effectués au mandataire commun ou, à défaut, répartis entre les comandants au prorata de leurs quotes-parts indivises telles qu'elles figurent à l'article 1 ; les répartitions ainsi faites libèrent valablement le mandataire.</p>
<!-- Dahir formant Code des obligations et des contrats, art. 164 et suivants : la solidarité ne se présume pas et doit être expressément stipulée -->

<h3>Article 14 — Conflits d'intérêts et exclusivité</h3>
<p>Le mandat est consenti à titre <strong>exclusif / non exclusif</strong> (rayer la mention inutile). S'il est exclusif, le mandant s'interdit, pendant sa durée, de confier la gestion ou la commercialisation locative du bien à un autre intermédiaire et de louer directement le bien sans l'intermédiaire du mandataire ; toute location conclue en violation de cette exclusivité ouvre droit, au profit du mandataire, à une indemnité égale à …………………… .</p>
<p>Le mandataire informe le mandant de tout conflit d'intérêts, et notamment de tout lien personnel, familial ou capitalistique avec un candidat locataire ou une entreprise appelée à intervenir sur le bien. Il ne peut se porter lui-même locataire du bien, directement ou indirectement, sans l'accord écrit du mandant.</p>

<h3>Article 15 — Révocation, renonciation et fin du mandat</h3>
<p>Le mandant peut révoquer le mandat et le mandataire y renoncer, à tout moment, par écrit à date certaine, moyennant un préavis de <strong>…………………… mois</strong> notifié avant l'échéance en cours.</p>
<p>La révocation du mandat pour faute grave du mandataire prend effet immédiat, sans préavis ni indemnité, après mise en demeure restée sans effet pendant …………………… jours.</p>
<p>Le mandataire qui renonce au mandat demeure tenu d'achever les opérations urgentes en cours et d'éviter tout préjudice au mandant jusqu'à la prise d'effet de sa renonciation.</p>
<p>À la fin du mandat, pour quelque cause que ce soit, le mandataire établit le compte rendu final prévu à l'article 9, restitue dans le délai de …………………… jours les fonds, les dépôts de garantie, les clés et l'ensemble des documents, et informe les locataires du changement de gestionnaire. Les baux conclus pendant le mandat demeurent en vigueur au profit et à la charge du mandant.</p>
<!-- Dahir formant Code des obligations et des contrats : le mandat prend fin notamment par la révocation du mandant et la renonciation du mandataire. Numéros d'articles non vérifiés -->

<h3>Article 16 — Responsabilité</h3>
<p>Le mandataire répond des fautes commises dans l'exécution de sa mission. Il n'est en revanche pas responsable des impayés des locataires, des dégradations de leur fait, des sinistres, des vices affectant le bien, ni des conséquences des instructions du mandant contre lesquelles il l'a préalablement mis en garde par écrit.</p>
<p>La responsabilité du mandataire ne peut être recherchée qu'à raison du préjudice direct et certain résultant d'un manquement caractérisé à ses obligations, et dans la limite des garanties de sa police de responsabilité civile professionnelle.</p>

<h3>Article 17 — Protection des données à caractère personnel</h3>
<p>Les données personnelles du mandant et des locataires sont traitées par le mandataire aux seules fins de l'exécution du présent mandat et des obligations légales et comptables qui s'y rattachent. Elles sont conservées pendant la durée du mandat et pendant les délais de prescription applicables, puis supprimées ou archivées. Les personnes concernées disposent d'un droit d'accès, de rectification et d'opposition, qu'elles exercent auprès du mandataire aux coordonnées figurant à l'article 2.</p>

<h3>Article 18 — Médiation et juridiction compétente</h3>
<p>En cas de différend relatif au présent mandat, les parties s'efforcent de parvenir à un règlement amiable, le cas échéant par la voie d'une médiation conventionnelle conduite dans les conditions prévues par la <strong>loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle</strong>.</p>
<p>À défaut de règlement amiable dans le délai de …………………… jours, le litige relève de la compétence du tribunal de commerce / du tribunal de première instance du lieu de situation de l'immeuble, auquel les parties attribuent expressément compétence.</p>
<!-- loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle -->

<h3>Article 19 — Enregistrement, annexes et dispositions finales</h3>
<p>Les droits d'enregistrement et de timbre éventuellement exigibles sur le présent mandat, dans les conditions et les délais du <strong>Code général des impôts</strong>, sont supportés par ……………………</p>
<p>Font partie intégrante du présent mandat : les titres de propriété et l'extrait du titre foncier, les pouvoirs et actes justifiant la qualité des comandants, le règlement de copropriété, l'inventaire du mobilier, les attestations d'assurance du mandant et du mandataire, l'état des lieux et le bail en cours s'il en existe, et la liste des lots visés à l'article 3.</p>
<p>Le présent mandat exprime l'intégralité de l'accord des parties et ne peut être modifié que par avenant écrit. La nullité d'une stipulation n'affecte pas la validité des autres.</p>
<p>Il est établi en autant d'originaux qu'il y a de parties, plus un exemplaire destiné le cas échéant à la formalité de l'enregistrement, chaque partie reconnaissant avoir reçu le sien.</p>

<h2 style="text-align: center">SIGNATURES</h2>
<p>Fait à {{property_city}}, le {{date}}. Chaque partie paraphe chacune des pages du présent mandat et de ses annexes et fait précéder sa signature de la mention manuscrite « lu et approuvé ».</p>
<table>
<thead>
<tr><th style="text-align: center">Le ou les mandants</th><th style="text-align: center">Le mandataire</th></tr>
</thead>
<tbody>
<tr>
<td>Nom : ……………………<br>Quote-part : ……………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part : ……………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part : ……………<br>Signature :<br><br></td>
<td>{{agency_name}}<br>Représentée par {{agent_name}}<br>Qualité : ……………………<br>Signature et cachet :<br><br><br></td>
</tr>
</tbody>
</table>
<p><em>Ajouter autant de blocs de signature que de mandants.</em></p>
$html$),
  ('mandate_sale', $nom$Mandat de vente (exclusif ou non exclusif)$nom$, $html$
<h1 style="text-align: center">MANDAT DE VENTE IMMOBILIÈRE</h1>
<p style="text-align: center"><strong>Mandat d'entremise consenti à un intermédiaire immobilier — variantes exclusive et non exclusive</strong></p>
<p style="text-align: center">Référence du bien : {{property_reference}} — Dossier : {{transaction_reference}} — Fait à {{property_city}}, le {{date}}</p>

<h2>ENTRE LES SOUSSIGNÉS</h2>

<h3>Article 1 — Le ou les mandants vendeurs</h3>
<p>{{parties_mandants}}</p>
<p>Ci-après désigné(s) « <strong>le mandant</strong> » ou « <strong>le vendeur</strong> », ce terme s'entendant de l'ensemble des personnes ci-dessus lorsqu'elles sont plusieurs, qu'elles agissent en qualité de propriétaires indivis, de copropriétaires, d'héritiers dans une indivision successorale, d'usufruitier et de nu-propriétaire, ou de représentants d'une personne morale.</p>
<p>Chaque mandant déclare être propriétaire du bien désigné à l'article 3 ou titulaire du droit d'en disposer, être juridiquement capable de contracter et, lorsqu'il agit pour le compte d'autrui ou d'une indivision, justifier d'un pouvoir régulier dont une copie demeure annexée aux présentes.</p>

<h3>Article 2 — Le mandataire</h3>
<p>L'agence <strong>{{agency_name}}</strong>, dont le siège est sis {{agency_address}}, identifiant professionnel n° {{agency_license}}, représentée aux présentes par {{agent_name}}.</p>
<p>Ci-après désignée « <strong>le mandataire</strong> » ou « <strong>l'agence</strong> ».</p>

<h2>IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT</h2>

<h3>Article 3 — Objet du mandat et désignation du bien</h3>
<p>Le mandant charge le mandataire de rechercher un acquéreur pour le bien immobilier ci-après désigné et de l'assister jusqu'à la conclusion de la vente :</p>
<table>
<tbody>
<tr><th>Nature du bien</th><td>{{property_type}}</td></tr>
<tr><th>Adresse</th><td>{{property_address}}</td></tr>
<tr><th>Ville</th><td>{{property_city}}</td></tr>
<tr><th>Surface</th><td>{{property_surface}}</td></tr>
<tr><th>Nombre de pièces principales</th><td>{{property_rooms}}</td></tr>
<tr><th>Étage et numéro</th><td>……………………</td></tr>
<tr><th>Titre foncier, réquisition ou référence du bien non immatriculé</th><td>……………………</td></tr>
<tr><th>Référence interne</th><td>{{property_reference}}</td></tr>
</tbody>
</table>
<p>Le bien comprend en outre les dépendances suivantes : ……………………………………………… Il est vendu libre d'occupation / occupé par un locataire au titre d'un bail dont copie est annexée (rayer la mention inutile).</p>
<p>Régime foncier du bien : <strong>immatriculé</strong> (titre foncier n° ……………………, conservation foncière de ……………………) / <strong>en cours d'immatriculation</strong> (réquisition n° ……………………) / <strong>non immatriculé</strong> (melk, moulkia du ……………………). Le mandant remet au mandataire les titres et actes justifiant sa propriété, dont la liste figure à l'article 14.</p>

<h3>Article 4 — Prix de présentation et prix net vendeur</h3>
<p>Le bien est présenté à la vente au prix de <strong>{{asking_price}}</strong>, soit …………………… DH (…………………………………………… dirhams), honoraires du mandataire <strong>inclus / en sus</strong> (rayer la mention inutile).</p>
<p>Le prix net que le mandant souhaite percevoir, hors honoraires du mandataire et hors frais à la charge de l'acquéreur, s'élève à <strong>…………………… DH</strong>.</p>
<p>Le prix figurant au présent article est un prix de présentation. Le mandataire est autorisé à recevoir et à transmettre au mandant toute offre, y compris inférieure, sans pouvoir l'accepter en son nom. Le mandant conserve la liberté d'accepter ou de refuser toute offre, ainsi que celle de modifier le prix de présentation par avenant écrit.</p>
<p>Le prix de présentation sera révisé d'un commun accord si le bien n'a pas trouvé acquéreur dans le délai de …………………… mois.</p>

<h3>Article 5 — Nature du mandat : exclusif ou non exclusif</h3>
<p>Les parties conviennent expressément que le présent mandat est consenti sous l'une des deux formes ci-après, la case correspondante étant cochée et l'article non retenu réputé non écrit :</p>
<table>
<thead>
<tr><th>Forme retenue</th><th>Conséquences</th></tr>
</thead>
<tbody>
<tr>
<td><strong>[ ] MANDAT NON EXCLUSIF (simple)</strong></td>
<td>Le mandant conserve la faculté de confier la vente du bien à d'autres intermédiaires et de le vendre lui-même directement. Les honoraires ne sont dus au mandataire que si la vente est conclue avec un acquéreur qu'il a lui-même présenté, dans les conditions de l'article 7.</td>
</tr>
<tr>
<td><strong>[ ] MANDAT EXCLUSIF</strong></td>
<td>Le mandant s'interdit, pendant la durée de l'exclusivité, de confier la vente du bien à tout autre intermédiaire et de traiter directement avec un acquéreur sans l'intermédiaire du mandataire. Toute vente conclue en violation de l'exclusivité ouvre droit à l'indemnité prévue à l'article 6.</td>
</tr>
</tbody>
</table>

<h3>Article 6 — Stipulations propres au mandat exclusif</h3>
<p>Les stipulations du présent article ne s'appliquent que si la forme exclusive a été retenue à l'article 5.</p>
<p>L'exclusivité est consentie pour une durée irréductible de <strong>…………………… mois</strong> à compter de la signature des présentes. Au-delà de cette période, le mandat se poursuit dans les conditions de l'article 10 mais l'exclusivité peut être dénoncée par l'une ou l'autre des parties, par écrit à date certaine, moyennant un préavis de …………………… jours.</p>
<p>Le mandant s'engage, pendant la durée de l'exclusivité, à :</p>
<ol>
<li>orienter vers le mandataire tout candidat acquéreur qui le contacterait directement, et à lui communiquer sans délai l'identité de celui-ci ;</li>
<li>ne pas diffuser ni faire diffuser d'annonce relative au bien par un autre canal que ceux du mandataire ;</li>
<li>ne pas organiser de visite hors la présence ou l'accord du mandataire.</li>
</ol>
<p>En contrepartie de l'exclusivité, le mandataire s'engage à mettre en œuvre les moyens renforcés énumérés à l'article 8, et à rendre compte au mandant de ses diligences au moins une fois par …………………… .</p>
<p>En cas de vente conclue en violation de l'exclusivité, ou avec un acquéreur présenté par le mandataire dans les conditions de l'article 7, le mandant est redevable envers le mandataire d'une indemnité forfaitaire égale au montant des honoraires prévus à l'article 9, à titre de clause pénale, sans préjudice de la réparation d'un préjudice distinct.</p>
<!-- Clause de pratique contractuelle : l'exclusivité, sa durée irréductible et la clause pénale relèvent de la liberté contractuelle. Aucun texte marocain spécifique à l'intermédiation immobilière n'a pu être cité -->

<h3>Article 7 — Acquéreur présenté par le mandataire</h3>
<p>Est réputé présenté par le mandataire tout candidat acquéreur, ainsi que son conjoint, ses ascendants, ses descendants, la personne morale qu'il contrôle ou toute personne agissant pour son compte, qui a été mis en relation avec le bien par le fait du mandataire, notamment par une visite, une annonce, une transmission de documentation ou une mise en relation écrite.</p>
<p>Le mandataire tient un registre des visites, contresigné par chaque visiteur, qui fait foi entre les parties de la présentation. Il adresse au mandant la liste nominative des candidats présentés, au plus tard lors de chaque compte rendu de diligences.</p>
<p>Les honoraires du mandataire demeurent dus lorsque la vente est conclue avec un acquéreur présenté par lui, y compris après l'expiration du mandat, dans la limite d'un délai de <strong>…………………… mois</strong> suivant cette expiration, à la condition que le candidat ait figuré sur la liste nominative transmise au mandant avant la fin du mandat.</p>

<h3>Article 8 — Diligences du mandataire</h3>
<p>Le mandataire s'engage à mettre en œuvre les moyens suivants :</p>
<ul>
<li>l'estimation documentée du bien et le conseil au mandant sur le prix de présentation ;</li>
<li>la réalisation du reportage photographique et, le cas échéant, de la visite virtuelle et du plan ;</li>
<li>la rédaction et la diffusion de l'annonce sur son site, sur les portails d'annonces et auprès de son fichier de clients acquéreurs ;</li>
<li>la qualification des candidats, la vérification de leur capacité de financement et l'organisation des visites, en présence d'un collaborateur de l'agence ;</li>
<li>la transmission au mandant de toutes les offres reçues, quel qu'en soit le montant, accompagnées des éléments permettant d'apprécier la solvabilité du candidat ;</li>
<li>l'assistance du mandant dans la négociation, la constitution du dossier et la préparation du compromis de vente ;</li>
<li>le suivi du dossier jusqu'à la signature de l'acte définitif, en relation avec le notaire ou l'avocat agréé rédacteur de l'acte, la banque de l'acquéreur et la conservation foncière.</li>
</ul>
<p>Le mandataire n'assume aucune obligation de résultat quant à la conclusion de la vente. Il rend compte de ses diligences au mandant et le tient informé de l'état de la commercialisation.</p>

<h3>Article 9 — Honoraires du mandataire</h3>
<p>En cas de conclusion de la vente, le mandataire perçoit des honoraires fixés à <strong>{{commission_rate}}</strong> du prix de vente effectif, soit, sur la base du prix de présentation, un montant de <strong>{{commission_amount}}</strong>, hors taxes.</p>
<p>À défaut d'indication, le taux applicable est de …………………… % du prix de vente, hors taxes, avec un minimum de …………………… DH.</p>
<p>Ces honoraires sont majorés de la taxe sur la valeur ajoutée au taux en vigueur, soit le taux normal de vingt pour cent (20 %) à la date des présentes.</p>
<p>La charge des honoraires est répartie comme suit : …………………… % à la charge du vendeur et …………………… % à la charge de l'acquéreur. La part incombant à l'acquéreur est portée au compromis de vente et à l'acte définitif.</p>
<p>Les honoraires sont exigibles <strong>le jour de la signature de l'acte définitif de vente</strong> et payables entre les mains du mandataire, le cas échéant par prélèvement sur le prix par le notaire ou l'avocat rédacteur, sur instruction écrite des parties. Il est expressément convenu qu'aucun honoraire n'est dû si la vente n'est pas conclue, sous réserve des articles 6 et 7.</p>
<p>Si le compromis de vente est signé puis caduc du fait de la défaillance de l'acquéreur, les honoraires ne sont pas dus, sauf si l'indemnité d'immobilisation est acquise au vendeur, auquel cas le mandataire perçoit …………………… % de cette indemnité au titre de ses diligences.</p>
<!-- Code général des impôts : taxe sur la valeur ajoutée, taux normal de 20 %. Numéro d'article non vérifié. La répartition des honoraires entre vendeur et acquéreur est une pratique contractuelle -->

<h3>Article 10 — Durée du mandat</h3>
<p>Le présent mandat est consenti pour une durée de <strong>…………………… mois</strong>, prenant effet le …………………… pour se terminer le ……………………</p>
<p>Il se renouvelle par tacite reconduction pour des périodes de …………………… mois, sans que la durée totale puisse excéder …………………… mois, sauf dénonciation par l'une des parties par écrit à date certaine moyennant un préavis de …………………… jours avant l'échéance en cours.</p>
<p>Le mandat prend fin par l'arrivée du terme, par la conclusion de la vente, par la révocation du mandant, par la renonciation du mandataire, par la perte du bien, ainsi que dans les cas prévus par le Dahir formant Code des obligations et des contrats.</p>
<!-- Dahir formant Code des obligations et des contrats, art. 879 et suivants : régime du mandat, révocation et renonciation. Numéros d'articles non vérifiés au-delà du chapitre -->

<h3>Article 11 — Déclarations et garanties du mandant</h3>
<p>Le mandant déclare et garantit :</p>
<ol>
<li>que le bien lui appartient et qu'il a la pleine capacité d'en disposer, chacun des comandants garantissant sa propre quote-part ;</li>
<li>que le bien est libre de toute hypothèque, nantissement, saisie, opposition, droit de préemption, servitude non apparente, bail ou occupation autres que ceux qu'il a expressément déclarés à l'article 3 et en annexe ;</li>
<li>qu'aucune procédure judiciaire, action en revendication, contestation d'héritage ou procédure d'expropriation n'affecte le bien ;</li>
<li>que les constructions ont été édifiées conformément aux autorisations administratives, et qu'il n'existe aucune infraction d'urbanisme ni aucun procès-verbal en cours dont il n'aurait informé le mandataire ;</li>
<li>qu'il est à jour du paiement des charges de copropriété, des impôts et taxes et des factures d'eau et d'électricité, ou qu'il a informé le mandataire du contraire ;</li>
<li>que l'ensemble des informations et documents remis au mandataire sont exacts et complets.</li>
</ol>
<p>Le mandant garantit le mandataire contre toute réclamation d'un tiers résultant de l'inexactitude de ces déclarations, et l'autorise à les porter à la connaissance des candidats acquéreurs.</p>

<h3>Article 12 — Pluralité de mandants — solidarité et mandataire commun</h3>
<p>Lorsque le mandant est constitué de plusieurs personnes, celles-ci sont tenues <strong>solidairement et indivisiblement</strong> de l'ensemble des obligations nées du présent mandat, notamment du paiement des honoraires, des indemnités et des garanties de l'article 11.</p>
<p>Le présent mandat est signé par l'ensemble des coïndivisaires ou, à défaut, par ceux d'entre eux justifiant d'un pouvoir écrit des autres, dont copie est annexée. Le mandant déclare que les quotes-parts énumérées à l'article 1 représentent la totalité des droits sur le bien ; à défaut, le mandataire n'est tenu de poursuivre la commercialisation qu'après régularisation de l'accord de tous les ayants droit.</p>
<p>Les comandants désignent, pour recevoir les comptes rendus, les offres et les notifications et pour donner au mandataire toute instruction, un mandataire commun en la personne de <strong>……………………</strong>, dont les décisions les engagent tous. À défaut, toute notification valablement faite à l'un d'eux est réputée faite à tous.</p>
<p>Il est rappelé que l'acceptation d'une offre portant sur la totalité du bien indivis requiert l'accord de tous les coïndivisaires ; le mandataire ne saurait être tenu pour responsable de l'échec d'une vente résultant du refus de l'un d'eux.</p>
<!-- Dahir formant Code des obligations et des contrats, art. 164 et suivants : la solidarité ne se présume pas et doit être expressément stipulée. Règles de l'indivision : l'acte de disposition sur le bien indivis requiert l'accord de tous les coïndivisaires (loi n° 39-08 formant Code des droits réels) -->

<h3>Article 13 — Acquéreur pluriel</h3>
<p>Le bien peut être acquis par plusieurs acquéreurs. Dans ce cas, l'offre et le compromis de vente identifient chacun d'eux ainsi que la quote-part indivise qu'il entend acquérir, et stipulent la solidarité des coacquéreurs au paiement du prix et des accessoires. Le mandataire présente au mandant les coacquéreurs comme un candidat unique au sens de l'article 7.</p>

<h3>Article 14 — Documents remis au mandataire</h3>
<p>Le mandant remet au mandataire, à la signature des présentes, les documents suivants :</p>
<ul>
<li>le certificat de propriété récent et l'extrait du titre foncier, ou la moulkia et les actes adoulaires pour un bien non immatriculé ;</li>
<li>le ou les actes d'acquisition antérieurs ;</li>
<li>l'acte d'hérédité, l'acte de partage ou l'acte de notoriété justifiant la qualité des comandants, le cas échéant ;</li>
<li>la copie des pièces d'identité ou documents d'immatriculation de chaque mandant ;</li>
<li>le permis d'habiter, le permis de construire et les plans autorisés ;</li>
<li>le règlement de copropriété, le dernier procès-verbal d'assemblée générale et l'attestation du syndic sur les charges ;</li>
<li>les derniers avis d'imposition et quittances de taxes locales, d'eau et d'électricité ;</li>
<li>le bail en cours et le dernier état des lieux, si le bien est occupé ;</li>
<li>le relevé de l'inscription hypothécaire et, le cas échéant, le décompte de la dette garantie en vue de la mainlevée.</li>
</ul>
<p>Le mandataire en accuse réception et s'engage à les conserver, à n'en faire usage qu'aux fins du présent mandat et à les restituer à l'expiration de celui-ci.</p>

<h3>Article 15 — Rédaction de l'acte et frais de la vente</h3>
<p>Les parties sont informées que la validité du transfert de propriété d'un bien immobilier est subordonnée à l'établissement d'un acte <strong>authentique</strong> ou d'un acte ayant date certaine établi par un avocat agréé près la Cour de cassation, et, pour un immeuble immatriculé, à son <strong>inscription sur le titre foncier</strong> auprès de la conservation foncière.</p>
<p>L'acte définitif sera reçu par <strong>……………………</strong> (notaire / avocat agréé près la Cour de cassation / adoul), désigné d'un commun accord par les parties à la vente.</p>
<p>Les droits d'enregistrement, les droits de timbre, les frais de conservation foncière, les frais et honoraires du rédacteur de l'acte sont supportés par l'acquéreur, sauf convention contraire portée au compromis. La taxe sur le profit immobilier éventuellement due à raison de la cession demeure à la charge du vendeur, conformément au Code général des impôts.</p>
<p>Le mandataire n'est ni le rédacteur de l'acte ni le dépositaire des fonds de la vente ; il n'encaisse en aucun cas le prix ni l'acompte, lesquels sont versés entre les mains du rédacteur de l'acte ou sur un compte séquestre.</p>
<!-- loi n° 39-08 formant Code des droits réels, art. 4 : les actes relatifs au transfert de la propriété immobilière doivent être établis par acte authentique ou par acte ayant date certaine dressé par un avocat agréé près la Cour de cassation -->
<!-- Dahir du 12 août 1913 sur l'immatriculation foncière, tel que modifié par la loi n° 14-07 : effet constitutif de l'inscription sur le titre foncier. Numéros d'articles non vérifiés -->
<!-- Code général des impôts : taxe sur le profit immobilier à la charge du cédant ; droits d'enregistrement. Taux non cités, non vérifiés -->

<h3>Article 16 — Obligations du mandataire en matière de probité</h3>
<p>Le mandataire s'interdit d'acquérir le bien pour lui-même, pour l'un de ses préposés, pour son conjoint, ses ascendants ou descendants, ou pour une personne morale qu'il contrôle, sans l'accord écrit et préalable du mandant donné en pleine connaissance de cette qualité.</p>
<p>Il informe le mandant de tout conflit d'intérêts et s'abstient de percevoir d'un candidat acquéreur une rémunération non portée à la connaissance du mandant. Il traite les données personnelles du mandant et des candidats conformément à la législation applicable à la protection des données à caractère personnel.</p>

<h3>Article 17 — Médiation et juridiction compétente</h3>
<p>En cas de différend relatif au présent mandat, les parties s'efforcent de parvenir à un règlement amiable, le cas échéant par la voie d'une médiation conventionnelle conduite dans les conditions prévues par la <strong>loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle</strong>.</p>
<p>À défaut de règlement amiable dans le délai de …………………… jours, le litige relève de la compétence du tribunal du lieu de situation de l'immeuble, auquel les parties attribuent expressément compétence.</p>
<!-- loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle -->

<h3>Article 18 — Dispositions finales</h3>
<p>Le présent mandat exprime l'intégralité de l'accord des parties et remplace tout échange antérieur portant sur le même objet. Il ne peut être modifié que par avenant écrit signé de toutes les parties, notamment pour la révision du prix de présentation ou le passage d'une forme exclusive à une forme non exclusive.</p>
<p>La nullité ou l'inopposabilité d'une stipulation n'affecte pas la validité des autres. Le fait pour une partie de ne pas se prévaloir d'un manquement de l'autre ne vaut pas renonciation à s'en prévaloir ultérieurement.</p>
<p>Le présent mandat est établi en autant d'originaux qu'il y a de parties, plus un exemplaire destiné le cas échéant à la formalité de l'enregistrement, chaque partie reconnaissant avoir reçu le sien.</p>

<h2 style="text-align: center">SIGNATURES</h2>
<p>Fait à {{property_city}}, le {{date}}. Chaque partie paraphe chacune des pages du présent mandat et de ses annexes et fait précéder sa signature de la mention manuscrite « lu et approuvé », ainsi que, pour le mandant, de la mention de la forme retenue à l'article 5 : « mandat exclusif » ou « mandat non exclusif ».</p>
<table>
<thead>
<tr><th style="text-align: center">Le ou les mandants vendeurs</th><th style="text-align: center">Le mandataire</th></tr>
</thead>
<tbody>
<tr>
<td>Nom : ……………………<br>Quote-part : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br></td>
<td>{{agency_name}}<br>Représentée par {{agent_name}}<br>Qualité : ……………………<br>Signature et cachet :<br><br><br></td>
</tr>
</tbody>
</table>
<p><em>Ajouter autant de blocs de signature que de mandants.</em></p>
$html$),
  ('compromise', $nom$Compromis de vente (promesse synallagmatique)$nom$, $html$
<h1 style="text-align: center">COMPROMIS DE VENTE</h1>
<p style="text-align: center"><strong>Promesse synallagmatique de vente d'un bien immobilier</strong></p>
<p style="text-align: center">Dossier : {{transaction_reference}} — Référence du bien : {{property_reference}} — Fait à {{property_city}}, le {{date}}</p>

<h2>ENTRE LES SOUSSIGNÉS</h2>

<h3>Article 1 — Le ou les vendeurs</h3>
<p>{{parties_vendeurs}}</p>
<p>Ci-après désigné(s) « <strong>le vendeur</strong> », ce terme s'entendant de l'ensemble des personnes ci-dessus lorsqu'elles sont plusieurs, qu'elles agissent en qualité de propriétaires indivis, de copropriétaires, d'héritiers dans une indivision successorale, d'usufruitier et de nu-propriétaire, ou de représentants d'une personne morale.</p>

<h3>Article 2 — Le ou les acquéreurs</h3>
<p>{{parties_acquereurs}}</p>
<p>Ci-après désigné(s) « <strong>l'acquéreur</strong> », ce terme s'entendant de l'ensemble des personnes ci-dessus lorsqu'elles sont plusieurs.</p>
<p>Lorsque les acquéreurs sont plusieurs, ils déclarent acquérir en indivision selon les quotes-parts indiquées à l'article 2 ; à défaut d'indication, l'acquisition est réputée faite par parts égales.</p>

<h3>Article 3 — Intervention de l'agence</h3>
<p>Les parties ont été mises en relation par l'agence <strong>{{agency_name}}</strong>, dont le siège est sis {{agency_address}}, identifiant professionnel n° {{agency_license}}, représentée par {{agent_name}}, laquelle intervient aux présentes au titre de son mandat et pour la constatation de ses honoraires à l'article 13.</p>

<h2>LES PARTIES ÉTANT CAPABLES, IL A ÉTÉ CONVENU CE QUI SUIT</h2>

<h3>Article 4 — Engagement réciproque</h3>
<p>Le vendeur s'engage à vendre et l'acquéreur s'engage à acquérir, aux conditions ci-après, le bien immobilier désigné à l'article 5.</p>
<p>Le présent acte constitue une <strong>promesse synallagmatique de vente</strong> : il engage définitivement les deux parties sur la chose et sur le prix, sous la seule réserve de la réalisation des conditions suspensives de l'article 9 et de la régularisation par acte définitif dans les formes légales rappelées à l'article 10.</p>
<p>Les parties reconnaissent avoir été informées que, en droit marocain, le transfert de la propriété immobilière suppose un acte authentique ou un acte ayant date certaine établi par un avocat agréé près la Cour de cassation et, pour un immeuble immatriculé, l'inscription de cet acte sur le titre foncier.</p>
<!-- loi n° 39-08 formant Code des droits réels, art. 4 : forme requise pour les actes de transfert de la propriété immobilière -->
<!-- Dahir du 12 août 1913 sur l'immatriculation foncière, modifié par la loi n° 14-07 : effet de l'inscription sur le titre foncier. Numéros d'articles non vérifiés -->
<!-- Dahir formant Code des obligations et des contrats, art. 488 et suivants : la vente est parfaite entre les parties dès l'accord sur la chose et sur le prix. Numéro d'article non vérifié -->

<h3>Article 5 — Désignation du bien vendu</h3>
<table>
<tbody>
<tr><th>Nature du bien</th><td>{{property_type}}</td></tr>
<tr><th>Adresse</th><td>{{property_address}}</td></tr>
<tr><th>Ville</th><td>{{property_city}}</td></tr>
<tr><th>Surface</th><td>{{property_surface}}</td></tr>
<tr><th>Nombre de pièces principales</th><td>{{property_rooms}}</td></tr>
<tr><th>Étage et numéro</th><td>……………………</td></tr>
<tr><th>Titre foncier ou réquisition d'immatriculation</th><td>……………………</td></tr>
<tr><th>Conservation foncière compétente</th><td>……………………</td></tr>
<tr><th>Référence interne</th><td>{{property_reference}}</td></tr>
</tbody>
</table>
<p>Le bien comprend les dépendances suivantes : ……………………………………………… ainsi que les tantièmes de parties communes y attachés, le cas échéant.</p>
<p>Régime foncier : <strong>immatriculé</strong> / <strong>en cours d'immatriculation</strong> / <strong>non immatriculé (melk)</strong>. Origine de propriété : le bien a été acquis par le vendeur suivant acte du …………………… reçu par …………………… , inscrit le …………………… sous le n° ……………………</p>
<p>L'acquéreur déclare avoir visité le bien le ……………………, en avoir pris connaissance dans son état actuel, et l'acquérir tel qu'il existe, sans garantie de contenance autre que celle résultant du titre foncier.</p>

<h3>Article 6 — Prix de vente</h3>
<p>Le prix de vente est fixé, d'un commun accord entre les parties, à la somme de <strong>…………………… DH</strong> (…………………………………………… dirhams), que l'acquéreur s'oblige à payer selon les modalités de l'article 8.</p>
<p>Pour mémoire, le bien avait été présenté à la vente au prix de {{asking_price}}.</p>
<p>Les parties déclarent que ce prix correspond à la valeur réelle du bien et qu'elles n'ont convenu d'aucune contre-lettre, dissimulation de prix ni versement occulte, et reconnaissent avoir été averties des sanctions civiles et fiscales attachées à la dissimulation du prix.</p>
<p>Mobilier et équipements inclus dans le prix : ……………………………………………… , évalués à …………………… DH, sur la base de l'inventaire annexé.</p>

<h3>Article 7 — Indemnité d'immobilisation et séquestre</h3>
<p>À titre d'indemnité d'immobilisation du bien et de garantie de son engagement, l'acquéreur verse ce jour la somme de <strong>…………………… DH</strong>, correspondant à …………………… % du prix de vente.</p>
<p>Cette somme est versée entre les mains de <strong>……………………</strong> (le notaire / l'avocat agréé rédacteur de l'acte), en qualité de séquestre, sur un compte dédié. Elle n'est en aucun cas remise au vendeur avant la signature de l'acte définitif, ni encaissée par l'agence.</p>
<p>Le sort de cette somme est le suivant :</p>
<ol>
<li>elle s'impute sur le prix de vente lors de la signature de l'acte définitif ;</li>
<li>elle est <strong>intégralement restituée</strong> à l'acquéreur, sans indemnité ni retenue, dans le délai de …………………… jours, si l'une des conditions suspensives de l'article 9 n'est pas réalisée dans les délais convenus sans faute de sa part, ou si la vente ne peut se réaliser du fait du vendeur ;</li>
<li>elle est <strong>acquise au vendeur</strong>, à titre d'indemnité forfaitaire, si l'acquéreur refuse de régulariser l'acte définitif alors que toutes les conditions suspensives sont réalisées, après mise en demeure restée sans effet pendant …………………… jours ;</li>
<li>en cas de refus du vendeur de régulariser alors que toutes les conditions sont réalisées, le vendeur doit à l'acquéreur, outre la restitution de l'indemnité, une somme d'un montant équivalent à titre de dédommagement, après mise en demeure restée sans effet pendant …………………… jours.</li>
</ol>
<p>Les stipulations du présent article ne privent aucune des parties du droit de poursuivre l'exécution forcée de la vente devant la juridiction compétente, ni de réclamer la réparation d'un préjudice distinct.</p>
<!-- Clause de pratique contractuelle : montant de l'indemnité d'immobilisation, délais et sort des fonds relèvent de la liberté contractuelle. Aucun plafond légal identifié -->

<h3>Article 8 — Modalités de paiement du prix</h3>
<p>Le prix est payable comme suit :</p>
<table>
<tbody>
<tr><th>Indemnité d'immobilisation versée ce jour, imputée sur le prix</th><td>…………………… DH</td></tr>
<tr><th>Complément payable comptant à la signature de l'acte définitif</th><td>…………………… DH</td></tr>
<tr><th>Financé par un prêt bancaire (condition suspensive de l'article 9)</th><td>…………………… DH</td></tr>
<tr><th>Total</th><td>…………………… DH</td></tr>
</tbody>
</table>
<p>Tous les versements sont effectués par virement bancaire ou par chèque certifié, entre les mains du rédacteur de l'acte, à l'exclusion de tout paiement en espèces au-delà des seuils légalement admis. Aucun fonds n'est versé entre les mains de l'agence.</p>
<p>Le vendeur ne donnera quittance du prix qu'après encaissement effectif des fonds.</p>

<h3>Article 9 — Conditions suspensives</h3>
<p>Les présentes sont conclues sous les conditions suspensives suivantes, stipulées dans l'intérêt de la partie indiquée, qui peut seule y renoncer par écrit :</p>
<p><strong>9.1 — Obtention d'un prêt par l'acquéreur</strong> (dans l'intérêt de l'acquéreur). L'acquéreur devra obtenir un prêt d'un montant maximal de …………………… DH, sur une durée maximale de …………………… ans, à un taux nominal maximal de …………………… %. Il s'oblige à déposer sa demande de prêt auprès d'au moins …………………… établissements dans le délai de …………………… jours à compter de ce jour, à en justifier au rédacteur de l'acte et à ne pas modifier sa situation de nature à compromettre son financement. La condition est réputée réalisée par la remise d'une offre de prêt conforme au plus tard le ……………………, et défaillie à défaut. Le refus de prêt doit être justifié par deux refus écrits d'établissements de crédit.</p>
<p><strong>9.2 — Situation hypothécaire et mainlevée</strong> (dans l'intérêt de l'acquéreur). Le vendeur devra justifier, au plus tard le ……………………, de la production d'un certificat de propriété récent exempt de toute inscription d'hypothèque, de nantissement, de saisie, d'opposition ou de prénotation, ou de l'obtention de la mainlevée et de la radiation des inscriptions existantes, dont le coût demeure à sa charge.</p>
<p><strong>9.3 — Absence de droit de préemption, de préférence ou de retrait</strong> (dans l'intérêt de l'acquéreur). La vente est conclue sous la condition de l'absence d'exercice de tout droit de préemption légal ou conventionnel, de tout droit de préférence du locataire ou du coïndivisaire, et de tout droit de retrait susceptible d'affecter la vente. Les notifications requises seront accomplies par le rédacteur de l'acte, aux frais de ……………………</p>
<p><strong>9.4 — Conformité administrative et urbanistique</strong> (dans l'intérêt de l'acquéreur). Le vendeur devra justifier du permis d'habiter ou du certificat de conformité, de l'absence d'infraction d'urbanisme constatée et de l'absence de procédure d'expropriation, d'alignement ou de servitude d'utilité publique affectant le bien, au plus tard le ……………………</p>
<p><strong>9.5 — Justification de la qualité et des pouvoirs du vendeur</strong> (dans l'intérêt de l'acquéreur). Le vendeur devra justifier de sa pleine qualité pour disposer du bien et, en cas d'indivision, de l'accord écrit de l'ensemble des coïndivisaires, de l'acte d'hérédité et de l'acte de partage, ainsi que des autorisations requises lorsque l'un des vendeurs est un incapable ou une personne morale.</p>
<p><strong>9.6 — Apurement des charges et des taxes</strong> (dans l'intérêt de l'acquéreur). Le vendeur devra produire l'attestation du syndic sur l'absence de charges impayées, ainsi que les quittances de taxes locales, d'eau et d'électricité arrêtées à la date de l'acte définitif.</p>
<p><strong>9.7 — Libération des lieux</strong> (dans l'intérêt de l'acquéreur). Le bien devra être libre de toute occupation au jour de l'acte définitif, sauf si l'acquéreur acquiert le bien occupé, le bail et le dernier état des lieux étant alors annexés aux présentes.</p>
<p>Chaque condition suspensive doit être réalisée au plus tard à la date indiquée et, à défaut de date, au plus tard huit (8) jours avant la date limite de signature de l'acte définitif fixée à l'article 11. La partie dans l'intérêt de laquelle la condition est stipulée peut, par écrit, y renoncer ou proroger le délai. La défaillance d'une condition suspensive rend les présentes caduques de plein droit, sans indemnité de part ni d'autre, et commande la restitution de l'indemnité d'immobilisation dans les conditions de l'article 7.</p>
<p>La partie qui, par sa faute ou sa négligence, empêche la réalisation d'une condition suspensive ne peut se prévaloir de sa défaillance.</p>
<!-- Dahir formant Code des obligations et des contrats : régime des obligations conditionnelles ; la condition est réputée accomplie lorsque le débiteur en a empêché la réalisation. Numéros d'articles non vérifiés -->

<h3>Article 10 — Déclarations et garanties du vendeur</h3>
<p>Le vendeur déclare et garantit :</p>
<ol>
<li>qu'il est propriétaire du bien, chacun des covendeurs garantissant sa propre quote-part, et qu'il n'existe aucune contestation sur son droit de propriété ;</li>
<li>que le bien est libre de toute hypothèque, nantissement, saisie, opposition, prénotation, bail, occupation, servitude non apparente ou droit de tiers, autres que ceux déclarés en annexe ;</li>
<li>qu'il n'existe aucune procédure judiciaire, action en revendication, litige successoral ni procédure collective le concernant et affectant le bien ;</li>
<li>que les constructions ont été édifiées conformément aux autorisations administratives et qu'aucune infraction d'urbanisme ne lui a été notifiée ;</li>
<li>qu'il n'a réalisé aucun travail affectant la structure ou les parties communes sans les autorisations requises ;</li>
<li>qu'il est à jour des charges de copropriété, des impôts et taxes et des factures des concessionnaires, ou qu'il en informe expressément l'acquéreur ;</li>
<li>qu'il n'a connaissance d'aucun vice caché affectant le bien.</li>
</ol>
<p>Le vendeur garantit l'acquéreur contre l'éviction et contre les vices cachés dans les conditions du Dahir formant Code des obligations et des contrats. Il s'engage à ne consentir, à compter de ce jour et jusqu'à la signature de l'acte définitif, aucun bail, aucune sûreté, aucune servitude ni aucun acte de disposition sur le bien.</p>
<!-- Dahir formant Code des obligations et des contrats : garantie d'éviction et garantie des vices cachés du vendeur. Numéros d'articles non vérifiés -->

<h3>Article 11 — Déclarations de l'acquéreur</h3>
<p>L'acquéreur déclare :</p>
<ol>
<li>avoir la capacité juridique d'acquérir et, s'il s'agit d'une personne morale, disposer des autorisations sociales requises ;</li>
<li>avoir pris connaissance de l'ensemble des documents énumérés à l'article 16 et annexés aux présentes ;</li>
<li>être informé du régime foncier du bien et des conséquences qui s'y attachent ;</li>
<li>faire son affaire personnelle des démarches et formalités lui incombant, notamment de sa demande de financement et du transfert des abonnements ;</li>
<li>que l'origine des fonds destinés au paiement du prix est licite et qu'il fournira au rédacteur de l'acte les justificatifs requis au titre des obligations de vigilance applicables.</li>
</ol>

<h3>Article 12 — Acte définitif, délai et lieu de signature</h3>
<p>L'acte définitif de vente sera reçu par <strong>……………………</strong> (notaire / avocat agréé près la Cour de cassation), désigné d'un commun accord, au plus tard le <strong>……………………</strong>, date limite impérative, sous réserve de la réalisation des conditions suspensives.</p>
<p>Ce délai peut être prorogé une fois, pour une durée de …………………… jours, par écrit signé des deux parties, notamment pour permettre l'achèvement d'une formalité administrative ou l'obtention d'une mainlevée.</p>
<p>La partie qui ne se présente pas à la date fixée, ou qui refuse de signer alors que toutes les conditions suspensives sont réalisées, est mise en demeure de régulariser dans le délai de …………………… jours par écrit à date certaine. À l'expiration de ce délai, l'autre partie peut, à son choix, poursuivre l'exécution forcée de la vente ou se prévaloir des sanctions de l'article 7.</p>
<p>La propriété et la jouissance du bien sont transférées à l'acquéreur à compter de l'inscription de l'acte définitif sur le titre foncier, la remise des clés intervenant le jour de la signature de l'acte définitif contre paiement intégral du prix, sauf convention contraire.</p>

<h3>Article 13 — Honoraires de l'agence</h3>
<p>Les honoraires de l'agence {{agency_name}}, dus au titre de l'entremise ayant abouti aux présentes, s'élèvent à <strong>{{commission_amount}}</strong>, soit {{commission_rate}} du prix de vente, hors taxes, majorés de la taxe sur la valeur ajoutée au taux en vigueur, soit le taux normal de vingt pour cent (20 %) à la date des présentes.</p>
<p>Ils sont supportés à raison de …………………… % par le vendeur et de …………………… % par l'acquéreur, et sont exigibles le jour de la signature de l'acte définitif. Les parties donnent instruction au rédacteur de l'acte de les prélever sur les fonds et de les régler directement à l'agence.</p>
<p>Si les présentes deviennent caduques par la défaillance d'une condition suspensive, aucun honoraire n'est dû à l'agence. Si elles deviennent caduques par la faute de l'une des parties, les honoraires sont dus par la partie défaillante dans les conditions du mandat la liant à l'agence.</p>

<h3>Article 14 — Frais, droits et fiscalité</h3>
<p>Le présent compromis est soumis aux formalités d'enregistrement dans les conditions, les délais et aux tarifs prévus par le <strong>Code général des impôts</strong>, la présentation à l'enregistrement devant intervenir dans le délai de <strong>trente (30) jours</strong> suivant la date de l'acte.</p>
<p>Les droits d'enregistrement et de timbre dus sur le présent acte, d'un montant de …………………… DH, sont supportés par ……………………</p>
<p>Les droits d'enregistrement, les droits de timbre, les frais de conservation foncière et les frais et honoraires du rédacteur de l'acte définitif sont à la charge de l'acquéreur, sauf les frais de mainlevée et de radiation des inscriptions, qui demeurent à la charge du vendeur.</p>
<p>La taxe sur le profit immobilier éventuellement due à raison de la cession est à la charge du vendeur, conformément au Code général des impôts ; le vendeur autorise le rédacteur de l'acte à en consigner le montant estimé sur le prix jusqu'à production du quitus.</p>
<p>Les charges de copropriété, les taxes locales et les consommations sont réparties entre les parties au jour de la signature de l'acte définitif, au prorata temporis, sur la base du dernier décompte connu, quitte à régularisation ultérieure.</p>
<!-- Code général des impôts : obligation d'enregistrement et délai de trente jours ; taxe sur le profit immobilier à la charge du cédant. Taux et tarifs volontairement non chiffrés, faute de vérification -->

<h3>Article 15 — Pluralité de parties — solidarité et indivisibilité</h3>
<p>Lorsque les vendeurs sont plusieurs, ils sont tenus <strong>solidairement et indivisiblement</strong> de l'ensemble des obligations nées des présentes, notamment des déclarations et garanties de l'article 10, de l'obligation de régulariser l'acte définitif et des indemnités éventuellement dues.</p>
<p>Lorsque les acquéreurs sont plusieurs, ils sont tenus <strong>solidairement et indivisiblement</strong> du paiement du prix, de l'indemnité d'immobilisation, des honoraires leur incombant et de l'obligation de régulariser l'acte définitif, quelle que soit la quote-part indivise acquise par chacun.</p>
<p>Les présentes forment un tout indivisible : elles ne peuvent être exécutées partiellement, ni portées sur une fraction seulement du bien, ni résolues à l'égard d'une seule des personnes composant une même partie.</p>
<p>Chaque partie plurale désigne, pour recevoir les notifications et exercer les options et renonciations prévues aux présentes, un mandataire commun : pour le vendeur, …………………… ; pour l'acquéreur, …………………… À défaut, toute notification valablement faite à l'un des membres d'une partie est réputée faite à tous.</p>
<p>Le décès de l'une des personnes composant une partie ne met pas fin aux présentes, qui obligent ses héritiers et ayants cause dans les mêmes termes, à charge pour eux de justifier de leur qualité dans le délai de …………………… jours.</p>
<!-- Dahir formant Code des obligations et des contrats, art. 164 et suivants : la solidarité ne se présume pas et doit être expressément stipulée -->
<!-- loi n° 39-08 formant Code des droits réels : l'acte de disposition portant sur la totalité d'un bien indivis requiert l'accord de tous les coïndivisaires. Numéro d'article non vérifié -->

<h3>Article 16 — Annexes</h3>
<p>Font partie intégrante des présentes :</p>
<ul>
<li>le certificat de propriété récent et l'extrait du titre foncier, ou la moulkia et les actes adoulaires ;</li>
<li>le ou les titres d'acquisition antérieurs ;</li>
<li>l'acte d'hérédité, l'acte de partage ou l'acte de notoriété, le cas échéant ;</li>
<li>la copie des pièces d'identité ou documents d'immatriculation de chaque partie et les pouvoirs des représentants ;</li>
<li>le permis d'habiter, le permis de construire et les plans autorisés ;</li>
<li>le règlement de copropriété, le dernier procès-verbal d'assemblée générale et l'attestation du syndic sur les charges ;</li>
<li>l'inventaire du mobilier inclus dans le prix ;</li>
<li>le bail en cours et l'état des lieux, si le bien est vendu occupé ;</li>
<li>le relevé des inscriptions hypothécaires et, le cas échéant, l'accord de mainlevée de l'établissement créancier ;</li>
<li>…………………………………………………………………</li>
</ul>

<h3>Article 17 — Élection de domicile et notifications</h3>
<p>Pour l'exécution des présentes, chaque partie élit domicile à l'adresse figurant aux articles 1 et 2. Les notifications requérant une date certaine sont faites par acte d'huissier de justice ou par lettre recommandée avec accusé de réception. Les échanges courants peuvent intervenir par tout moyen écrit, y compris électronique, aux adresses déclarées, notamment {{client_email}} et {{client_phone}}.</p>
<p>Tout changement d'adresse doit être notifié à l'autre partie et au rédacteur de l'acte dans le délai de huit jours ; à défaut, les notifications faites au domicile élu sont réputées valablement reçues.</p>

<h3>Article 18 — Médiation et juridiction compétente</h3>
<p>En cas de différend relatif à la formation, à l'interprétation ou à l'exécution des présentes, les parties s'efforcent de parvenir à un règlement amiable, le cas échéant par la voie d'une médiation conventionnelle conduite dans les conditions prévues par la <strong>loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle</strong>, dans un délai qui ne saurait excéder …………………… jours.</p>
<p>À défaut de règlement amiable, le litige relève de la compétence du tribunal de première instance du lieu de situation de l'immeuble, auquel les parties attribuent expressément compétence. La tentative de médiation ne fait pas obstacle aux mesures conservatoires et aux procédures d'urgence, notamment à la prénotation destinée à conserver les droits de l'acquéreur sur le titre foncier.</p>
<!-- loi n° 95-17 relative à l'arbitrage et à la médiation conventionnelle -->

<h3>Article 19 — Dispositions finales</h3>
<p>Les présentes expriment l'intégralité de l'accord des parties et remplacent toute offre, promesse ou échange antérieur portant sur le même objet. Elles ne peuvent être modifiées que par avenant écrit signé de toutes les parties.</p>
<p>La nullité ou l'inopposabilité d'une stipulation n'affecte pas la validité des autres. Le fait pour une partie de ne pas se prévaloir d'un manquement de l'autre ne vaut pas renonciation à s'en prévaloir ultérieurement.</p>
<p>Les présentes sont établies en autant d'originaux qu'il y a de parties, plus un exemplaire destiné au rédacteur de l'acte définitif, un exemplaire destiné à la formalité de l'enregistrement et un exemplaire destiné à l'agence, chaque partie reconnaissant avoir reçu le sien.</p>

<h2 style="text-align: center">SIGNATURES</h2>
<p>Fait à {{property_city}}, le {{date}}. Chaque partie paraphe chacune des pages des présentes et de leurs annexes et fait précéder sa signature de la mention manuscrite « lu et approuvé, bon pour vente » pour le vendeur et « lu et approuvé, bon pour acquisition » pour l'acquéreur.</p>
<table>
<thead>
<tr><th style="text-align: center">Le ou les vendeurs</th><th style="text-align: center">Le ou les acquéreurs</th></tr>
</thead>
<tbody>
<tr>
<td>Nom : ……………………<br>Quote-part cédée : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part cédée : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part cédée : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br></td>
<td>Nom : ……………………<br>Quote-part acquise : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part acquise : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br><br>Nom : ……………………<br>Quote-part acquise : ……………<br>Mention manuscrite : ……………………<br>Signature :<br><br></td>
</tr>
</tbody>
</table>
<p><em>Ajouter autant de blocs de signature que de parties de chaque côté.</em></p>
<p>Pour l'agence {{agency_name}}, {{agent_name}} : ……………………</p>
<p>Le séquestre, ……………………, reconnaît avoir reçu la somme de …………………… DH au titre de l'article 7 : ……………………</p>
$html$)
)
INSERT INTO contract.contract_template (
    agency_id, document_type, name, body_html, is_builtin, created_at, updated_at)
SELECT NULL, m.document_type, m.name, m.body_html, TRUE, NOW(), NOW()
FROM modeles m
WHERE NOT EXISTS (
    SELECT 1 FROM contract.contract_template t
    WHERE t.agency_id IS NULL AND t.name = m.name);
