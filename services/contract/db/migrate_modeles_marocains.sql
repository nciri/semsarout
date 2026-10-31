-- Modèles de contrats marocains — cinq actes, chacun en français et en arabe.
--
-- GÉNÉRÉ par `services/contract/tools/build_modeles_marocains.py` depuis les .docx de
-- `docs/contracts_models/`. Ne pas éditer à la main : corriger le .docx puis relancer le
-- générateur, sinon la prochaine exécution écrase la correction.
--
-- Remplace les quatre modèles intégrés d'origine (une page de clauses génériques chacun) par
-- des actes complets, sourcés sur le DOC, la loi n° 67-12 (baux), la loi n° 44-00 et la loi
-- n° 107-12 (VEFA), le Code des droits réels tel que modifié par la loi n° 41-25, et le Dahir
-- du 12 août 1913 sur l'immatriculation foncière.
--
-- Rejouable : chaque insertion est gardée par un NOT EXISTS sur (agency_id IS NULL, name).


-- 1. Retrait des quatre modèles intégrés d'origine. Les contrats déjà
-- générés ne sont pas touchés : leur corps est copié dans `contract.body_html`
-- à la création, le modèle ne sert plus après coup.
DELETE FROM contract.contract_template
 WHERE is_builtin IS TRUE AND agency_id IS NULL AND name IN ($n$Bail à usage d'habitation (loi 67-12)$n$, $n$Mandat de gestion locative (gérance)$n$, $n$Mandat de vente (exclusif ou non exclusif)$n$, $n$Compromis de vente (promesse synallagmatique)$n$, $n$Mandat de vente$n$, $n$Mandat de location / gestion$n$, $n$Compromis de vente$n$, $n$Contrat de bail (habitation)$n$);

-- 2. Les dix modèles (cinq actes × deux langues).
-- Upsert sur l'index unique partiel des modèles intégrés : un acte révisé dans son
-- .docx se propage au déploiement suivant. Une insertion gardée par NOT EXISTS
-- laissait la première version en base pour toujours.
INSERT INTO contract.contract_template (agency_id, document_type, name, lang, body_html, is_builtin, created_at, updated_at)
SELECT NULL::int, 'compromise', $nom$Compromis de vente — acte authentique (loi n° 41-25)$nom$, 'fr', $html$
<h1 style="text-align:center;"><strong>COMPROMIS DE VENTE D'UN BIEN IMMOBILIER IMMATRICULÉ</strong></h1>
<p style="text-align:center;"><em><em>Promesse synallagmatique de vente — Dahir des obligations et contrats (DOC), loi n° 39-08 portant Code des droits réels (telle que modifiée par la loi n° 41-25), Dahir du 12 août 1913 sur l'immatriculation foncière (tel que modifié par la loi n° 14-07)</em></em></p>
<blockquote><strong>AVERTISSEMENT — FORME OBLIGATOIRE.</strong> Depuis la publication de la loi n° 41-25 (dahir n° 1-26-30 du 3 juillet 2026, B.O. n° 7526 du 16 juillet 2026), l'article 4 du Code des droits réels impose, <strong>sous peine de nullité</strong>, que la promesse de vente immobilière soit dressée par <strong>acte authentique</strong> (notaire ou adoul). L'acte à date certaine rédigé par un avocat n'est plus admis.<br>Le présent document est donc un <strong>projet de clauses</strong> destiné à être remis au notaire ou aux adouls instrumentaires. Il ne doit <strong>jamais</strong> être signé sous seing privé comme valant compromis. L'agence intermédiaire peut le préparer mais ne peut pas le recevoir.<br>Les passages entre crochets [ ] et les pointillés sont à compléter ; les options ☐ sont à cocher ou à supprimer.</blockquote>
<h3><strong>ENTRE LES SOUSSIGNÉS</strong></h3>
<p style="text-align:justify;"><strong>1. LE PROMETTANT-VENDEUR</strong> (ci-après « le Vendeur ») :</p>
<p style="text-align:justify;">☐ Personne physique : M./Mme {{nom_vendeurs}}, de nationalité ……………, né(e) le …………… à ……………, titulaire de la CNIE / du passeport n° ……………, demeurant à ……………………………, état civil et régime matrimonial : ……………………</p>
<p style="text-align:justify;">☐ Personne morale : société ……………………, forme ……………, capital ………… MAD, siège ……………………, RC n° ………… (tribunal de ……………), ICE ……………, IF ……………, représentée par …………………… en vertu de ……………………</p>
<p style="text-align:justify;"><strong>2. LE BÉNÉFICIAIRE-ACQUÉREUR</strong> (ci-après « l'Acquéreur ») :</p>
<p style="text-align:justify;">M./Mme / Société {{nom_acquereurs}}, [mêmes mentions d'identification que ci-dessus], demeurant / siège à ……………………………</p>
<p style="text-align:justify;">En cas de pluralité d'acquéreurs, ceux-ci acquièrent ☐ en indivision, à concurrence de ……… % chacun ☐ solidairement.</p>
<p style="text-align:justify;"><strong>3. EN PRÉSENCE DE L'INTERMÉDIAIRE</strong> (le cas échéant) : agence {{agency_name}}, RC n° {{agency_rc}}, ICE {{agency_ice}}, représentée par {{agent_name}}, agissant en vertu d'un mandat de vente en date du ……………, qui n'est <strong>pas partie</strong> à la vente et ne contracte aucune obligation de vendeur ou d'acquéreur.</p>
<h3><strong>ARTICLE 1 — OBJET</strong></h3>
<p style="text-align:justify;">Le Vendeur s'engage à vendre à l'Acquéreur, qui s'engage à acquérir, le bien immobilier désigné à l'article 2, aux prix, charges et conditions ci-après. Les parties déclarent que le présent compromis vaut <strong>promesse synallagmatique de vente</strong> et que le transfert de propriété n'interviendra qu'à la signature de l'acte authentique de vente définitif et à son <strong>inscription sur le titre foncier</strong> (articles 66 et 67 du Dahir du 12 août 1913).</p>
<h3><strong>ARTICLE 2 — DÉSIGNATION DU BIEN</strong></h3>
<p style="text-align:justify;">Nature du bien : ☐ appartement ☐ villa ☐ maison ☐ local ☐ terrain ☐ autre : ……………</p>
<p style="text-align:justify;">Situation : {{property_address}}, commune de {{property_city}}, préfecture/province de ……………</p>
<p style="text-align:justify;">Titre foncier n° ……………… / ……, Conservation foncière de ……………………, dénommé « …………………… »</p>
<p style="text-align:justify;">Superficie : {{property_surface_nombre}} m² (titre) ; superficie habitable / utile : ……… m²</p>
<p style="text-align:justify;">Consistance : {{property_consistance}} (pièces, étage, annexes, parking, cave, terrasse…)</p>
<p style="text-align:justify;">☐ <strong>Copropriété (loi n° 18-00, telle que modifiée)</strong> : lot n° ………, quote-part de ……… / ……… des parties communes, règlement de copropriété déposé à la Conservation foncière le ……………</p>
<p style="text-align:justify;">Le bien est vendu avec ses aisances, dépendances et servitudes actives et passives, sans exception ni réserve autre que celles mentionnées au présent acte.</p>
<h3><strong>ARTICLE 3 — ORIGINE DE PROPRIÉTÉ ET SITUATION JURIDIQUE</strong></h3>
<p style="text-align:justify;">Le Vendeur déclare être seul propriétaire du bien, pour l'avoir acquis suivant ……………………… en date du ……………, inscrit au titre foncier le …………….</p>
<p style="text-align:justify;">Un <strong>certificat de propriété</strong> délivré par la Conservation foncière depuis moins de [30] jours est annexé au présent acte. Il fait apparaître les inscriptions suivantes : ☐ aucune ☐ hypothèque au profit de …………… pour ………… MAD ☐ autre : ……………</p>
<p style="text-align:justify;">Le Vendeur s'oblige à procéder, au plus tard à la signature de l'acte définitif, à la <strong>mainlevée</strong> de toute hypothèque, saisie ou prénotation grevant le bien, le cas échéant au moyen du prix de vente.</p>
<p style="text-align:justify;">Le Vendeur déclare que le bien n'est ni loué ni occupé, sauf : ……………………… (en cas de location, joindre copie du bail ; le bail en cours est opposable à l'Acquéreur conformément à la loi n° 67-12).</p>
<h3><strong>ARTICLE 4 — PRIX</strong></h3>
<p style="text-align:justify;">La vente, si elle se réalise, est consentie et acceptée moyennant le prix global et forfaitaire de <strong>……………………… dirhams ({{asking_price_nombre}} MAD)</strong>, toutes taxes éventuellement exigibles incluses, payable comme suit :</p>
<p style="text-align:justify;">– <strong>Acompte</strong> versé ce jour : ……………… MAD, par ☐ virement ☐ chèque certifié n° ………… tiré sur ……………, entre les mains du notaire instrumentaire, qui le conserve en <strong>compte de dépôt</strong> jusqu'à la signature de l'acte définitif ;</p>
<p style="text-align:justify;">– <strong>Solde</strong> : ……………… MAD, payable à la signature de l'acte définitif, ☐ au moyen de fonds propres ☐ au moyen d'un prêt bancaire visé à l'article 6.</p>
<p style="text-align:justify;">Aucun paiement en espèces n'est admis. ☐ <strong>Acquéreur non-résident</strong> : le prix est réglé en devises convertibles rapatriées, afin de préserver le droit de retransfert prévu par la réglementation des changes.</p>
<h3><strong>ARTICLE 5 — NATURE DE L'ACOMPTE</strong></h3>
<p style="text-align:justify;">Les parties conviennent que la somme versée constitue (cocher une option) :</p>
<p style="text-align:justify;">☐ <strong>un acompte sur le prix</strong> : il s'impute sur le prix en cas de réalisation ; en cas de défaillance d'une partie, l'autre peut poursuivre l'exécution forcée ou demander la résolution avec dommages-intérêts, et la clause pénale de l'article 11 s'applique ;</p>
<p style="text-align:justify;">☐ <strong>des arrhes</strong> au sens des articles 288 à 290 du DOC : en cas de dédit de l'Acquéreur, elles restent acquises au Vendeur ; en cas de dédit du Vendeur, celui-ci les restitue au double.</p>
<p style="text-align:justify;">Dans tous les cas, l'acompte est intégralement restitué à l'Acquéreur, sans pénalité, si l'une des conditions suspensives de l'article 6 n'est pas réalisée sans faute de sa part.</p>
<h3><strong>ARTICLE 6 — CONDITIONS SUSPENSIVES</strong></h3>
<p style="text-align:justify;">La réalisation de la vente est subordonnée aux conditions suspensives suivantes (articles 107 et suivants du DOC) :</p>
<p style="text-align:justify;">– délivrance d'un <strong>certificat de propriété</strong> à jour ne révélant aucune inscription autre que celles mentionnées à l'article 3 ou appelées à être levées par le prix ;</p>
<p style="text-align:justify;">– ☐ obtention par l'Acquéreur d'un <strong>prêt immobilier</strong> de ……………… MAD, sur ……… ans, à un taux maximal de ……… %, auprès de tout établissement de crédit, au plus tard le …………… ; l'Acquéreur s'oblige à déposer sa demande dans les [15] jours et à justifier de toute décision ;</p>
<p style="text-align:justify;">– remise par le Vendeur des attestations de <strong>situation fiscale</strong> du bien (taxe d'habitation, taxe de services communaux) et, le cas échéant, de l'<strong>attestation du syndic</strong> certifiant le paiement des charges de copropriété ;</p>
<p style="text-align:justify;">– absence de tout droit de préemption ou de servitude d'urbanisme rendant le bien impropre à sa destination (note de renseignements urbanistiques à produire : ☐ oui ☐ non) ;</p>
<p style="text-align:justify;">– ☐ autre : ……………………………………………</p>
<p style="text-align:justify;">À défaut de réalisation d'une condition dans le délai fixé, le présent compromis sera caduc de plein droit, sauf renonciation écrite de la partie au profit de laquelle la condition est stipulée.</p>
<h3><strong>ARTICLE 7 — RÉITÉRATION PAR ACTE DÉFINITIF</strong></h3>
<p style="text-align:justify;">L'acte authentique de vente sera reçu par Maître ……………………, notaire à …………… (ou par les adouls ……………………), <strong>au plus tard le ……………</strong> (ci-après la « Date de réitération »).</p>
<p style="text-align:justify;">Si, à cette date, toutes les conditions suspensives sont réalisées et que l'une des parties refuse de signer, l'autre pourra, après <strong>mise en demeure</strong> restée sans effet pendant [15] jours, soit poursuivre en justice la réalisation forcée de la vente, le jugement définitif valant titre de vente inscriptible, soit se prévaloir de la résolution du compromis et de la clause pénale de l'article 11.</p>
<h3><strong>ARTICLE 8 — PRÉNOTATION</strong></h3>
<p style="text-align:justify;">L'Acquéreur est autorisé à requérir, à ses frais, l'inscription d'une <strong>prénotation</strong> sur le titre foncier en vertu du présent acte authentique, conformément à l'article 85 du Dahir du 12 août 1913 tel que modifié par la loi n° 14-07, afin de conserver son rang. Le Vendeur s'interdit, jusqu'à la Date de réitération, de consentir sur le bien tout droit réel, bail ou promesse au profit d'un tiers.</p>
<h3><strong>ARTICLE 9 — PROPRIÉTÉ, JOUISSANCE, RISQUES</strong></h3>
<p style="text-align:justify;">L'Acquéreur deviendra propriétaire par l'inscription de l'acte définitif sur le titre foncier. La jouissance aura lieu ☐ à la signature de l'acte définitif, par la remise des clés, le bien étant libre de toute occupation ☐ autre : ……………</p>
<p style="text-align:justify;">Jusqu'à la remise des clés, le bien demeure aux risques du Vendeur, qui s'oblige à l'entretenir et à le maintenir assuré. En cas de sinistre important, l'Acquéreur pourra renoncer à l'acquisition et obtenir la restitution de l'acompte.</p>
<h3><strong>ARTICLE 10 — GARANTIES ET DÉCLARATIONS</strong></h3>
<p style="text-align:justify;">Le Vendeur doit à l'Acquéreur la <strong>garantie d'éviction</strong> et la <strong>garantie des vices cachés</strong> dans les conditions des articles 532 et suivants et 549 et suivants du DOC. ☐ Les parties conviennent que le bien est vendu en l'état apparent, le Vendeur déclarant n'avoir connaissance d'aucun vice caché ; cette clause est sans effet en cas de vice connu et dissimulé par le Vendeur.</p>
<p style="text-align:justify;">Le Vendeur déclare : que le bien n'a fait l'objet d'aucune construction ou modification sans autorisation ; qu'il n'existe aucune procédure en cours le concernant ; ☐ que le bien n'est pas son logement familial, ou que le consentement requis a été recueilli.</p>
<h3><strong>ARTICLE 11 — CLAUSE PÉNALE</strong></h3>
<p style="text-align:justify;">Si, toutes les conditions suspensives étant réalisées, l'une des parties refuse de réitérer la vente, elle versera à l'autre, à titre d'indemnité forfaitaire, une somme de <strong>……………… MAD</strong> (soit ……… % du prix), sans préjudice de l'exécution forcée. Conformément à l'article 264 du DOC, le tribunal peut réduire ou augmenter cette indemnité si elle est manifestement excessive ou dérisoire.</p>
<h3><strong>ARTICLE 12 — FRAIS, IMPÔTS ET RÉMUNÉRATION DE L'INTERMÉDIAIRE</strong></h3>
<p style="text-align:justify;">Sont à la charge de l'<strong>Acquéreur</strong> : les honoraires du notaire ou des adouls, les droits d'enregistrement, les droits de conservation foncière et les frais de prénotation, aux tarifs en vigueur à la date de l'acte définitif.</p>
<p style="text-align:justify;">Sont à la charge du <strong>Vendeur</strong> : l'impôt sur le profit immobilier (Code général des impôts), les frais de mainlevée, les taxes locales arriérées et les charges de copropriété échues à la date de l'acte définitif.</p>
<p style="text-align:justify;">La rémunération de l'intermédiaire, fixée à {{commission_rate_nombre}} % TTC du prix (soit {{commission_amount_nombre}} MAD), est à la charge de ☐ du Vendeur ☐ de l'Acquéreur ☐ des deux par moitié. Elle n'est due qu'à la <strong>signature de l'acte définitif</strong> et sera réglée par le notaire sur instruction de la partie débitrice.</p>
<h3><strong>ARTICLE 13 — CONFORMITÉ (LBC/FT) ET DONNÉES PERSONNELLES</strong></h3>
<p style="text-align:justify;">Les parties déclarent que les fonds utilisés ont une origine licite et s'engagent à fournir au notaire et à l'intermédiaire, assujettis à la loi n° 43-05 relative à la lutte contre le blanchiment de capitaux telle que modifiée, tout justificatif d'identité et d'origine des fonds.</p>
<p style="text-align:justify;">Les données personnelles des parties sont traitées aux seules fins de l'exécution du présent acte, conformément à la loi n° 09-08 ; chaque partie dispose d'un droit d'accès, de rectification et d'opposition.</p>
<h3><strong>ARTICLE 14 — DOMICILE, LANGUE ET LITIGES</strong></h3>
<p style="text-align:justify;">Les parties élisent domicile en leurs adresses indiquées en tête des présentes. Toute notification est valablement faite par lettre recommandée avec accusé de réception ou par huissier de justice.</p>
<p style="text-align:justify;">Le présent acte est établi ☐ en langue française uniquement ☐ en deux versions, française et arabe, signées ensemble ; dans ce cas, en cas de divergence, la version ☐ arabe ☐ française prévaut.</p>
<p style="text-align:justify;">Le présent acte est régi par le droit marocain. Tout litige relève de la compétence du tribunal de première instance du lieu de situation du bien.</p>
<h3><strong>PIÈCES ANNEXÉES</strong></h3>
<p style="text-align:justify;">– Copie des pièces d'identité des parties ;</p>
<p style="text-align:justify;">– Certificat de propriété de moins de [30] jours ;</p>
<p style="text-align:justify;">– Plan cadastral / plan du lot ;</p>
<p style="text-align:justify;">– ☐ Règlement de copropriété et attestation du syndic ;</p>
<p style="text-align:justify;">– ☐ Accord de principe ou offre de prêt ;</p>
<p style="text-align:justify;">– ☐ Copie du bail en cours ;</p>
<p style="text-align:justify;">– Mandat de l'intermédiaire.</p>
<p style="text-align:justify;">Fait à {{agency_city}}, le {{date}}, en la forme authentique, en ……… exemplaires originaux.</p>
<table><tbody><tr><td><strong>Le Vendeur</strong><br><em>« Lu et approuvé »</em><br>Signature légalisée</td><td><strong>L'Acquéreur</strong><br><em>« Lu et approuvé »</em><br>Signature légalisée</td><td><strong>Le Notaire / les Adouls</strong><br><em>Sceau et signature</em></td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'compromise', $nom$وعد متبادل ببيع عقار محفظ$nom$, 'ar', $html$
<h1 style="text-align:center;"><strong>وعد متبادل ببيع عقار محفظ</strong></h1>
<p style="text-align:center;"><em>وعد متبادل بالبيع — ظهير الالتزامات والعقود، القانون رقم 39.08 المتعلق بمدونة الحقوق العينية (كما تم تغييره بالقانون رقم 41.25)، ظهير 12 غشت 1913 المتعلق بالتحفيظ العقاري (كما تم تغييره بالقانون رقم 14.07)</em></p>
<blockquote style="text-align:right;"><strong>تنبيه — الشكل الإلزامي.</strong> منذ نشر القانون رقم 41.25 (الظهير الشريف رقم 1.26.30 بتاريخ 3 يوليوز 2026، الجريدة الرسمية عدد 7526 بتاريخ 16 يوليوز 2026)، أصبحت المادة 4 من مدونة الحقوق العينية توجب، <strong>تحت طائلة البطلان</strong>، تحرير الوعد بالبيع العقاري في <strong>محرر رسمي</strong> (موثق أو عدول). ولم يعد المحرر الثابت التاريخ الذي يحرره المحامي مقبولا.<br>وعليه، فإن هذه الوثيقة <strong>مشروع بنود</strong> معد لتسليمه إلى الموثق أو العدلين المكلفين بالتلقي، ولا يجوز <strong>أبدا</strong> توقيعها بصفة عرفية على أنها وعد بالبيع. ويمكن للوكالة الوسيطة إعدادها دون أن يكون لها حق تلقيها.<br>تُملأ الفراغات والعبارات الموضوعة بين معقوفتين [ ]، ويُؤشَّر على الخيارات ☐ أو تُحذف.</blockquote>
<h3 style="text-align:right;"><strong>بين الموقعين أسفله</strong></h3>
<p style="text-align:right;"><strong>1. الواعد البائع</strong> (يشار إليه فيما يلي بـ «البائع»):</p>
<p style="text-align:right;">☐ شخص ذاتي: السيد(ة) {{nom_vendeurs}}، الجنسية ……………، المزداد(ة) بتاريخ …………… بـ ……………، الحامل(ة) للبطاقة الوطنية للتعريف الإلكترونية / جواز السفر رقم ……………، الساكن(ة) بـ ……………………………، الحالة المدنية والنظام المالي للزوجين: ……………………</p>
<p style="text-align:right;">☐ شخص اعتباري: شركة ……………………، شكلها ……………، رأسمالها ………… درهم، مقرها ……………………، المقيدة بالسجل التجاري تحت رقم ………… (محكمة ……………)، التعريف الموحد للمقاولة ……………، التعريف الضريبي ……………، يمثلها …………………… بمقتضى ……………………</p>
<p style="text-align:right;"><strong>2. المستفيد المشتري</strong> (يشار إليه فيما يلي بـ «المشتري»):</p>
<p style="text-align:right;">السيد(ة) / الشركة {{nom_acquereurs}}، [نفس بيانات التعريف المذكورة أعلاه]، الساكن(ة) / مقرها بـ ……………………………</p>
<p style="text-align:right;">في حالة تعدد المشترين، يتم الاقتناء ☐ على الشياع بنسبة ……… % لكل واحد ☐ على وجه التضامن.</p>
<p style="text-align:right;"><strong>3. بحضور الوسيط</strong> (عند الاقتضاء): وكالة {{agency_name}}، سجل تجاري رقم {{agency_rc}}، التعريف الموحد {{agency_ice}}، يمثلها {{agent_name}}، بمقتضى وكالة بيع مؤرخة في ……………، وهو <strong>ليس طرفا</strong> في البيع ولا يتحمل أي التزام من التزامات البائع أو المشتري.</p>
<h3 style="text-align:right;"><strong>المادة 1 — الموضوع</strong></h3>
<p style="text-align:right;">يلتزم البائع ببيع العقار المبين في المادة 2 إلى المشتري الذي يلتزم بشرائه، وفق الثمن والتحملات والشروط الآتية. ويصرح الطرفان بأن هذا العقد يعتبر <strong>وعدا متبادلا بالبيع</strong>، وأن انتقال الملكية لن يتم إلا بتوقيع عقد البيع النهائي الرسمي و<strong>تقييده بالرسم العقاري</strong> (الفصلان 66 و67 من ظهير 12 غشت 1913).</p>
<h3 style="text-align:right;"><strong>المادة 2 — تعيين العقار</strong></h3>
<p style="text-align:right;">طبيعة العقار: ☐ شقة ☐ فيلا ☐ منزل ☐ محل ☐ أرض ☐ آخر: ……………</p>
<p style="text-align:right;">الموقع: {{property_address}}، جماعة {{property_city}}، عمالة/إقليم ……………</p>
<p style="text-align:right;">الرسم العقاري عدد ……………… / ……، المحافظة العقارية بـ ……………………، المسمى «……………………»</p>
<p style="text-align:right;">المساحة: {{property_surface_nombre}} م² (حسب الرسم)؛ المساحة الصالحة للسكن / المستعملة: ……… م²</p>
<p style="text-align:right;">المشتملات: {{property_consistance}} (الغرف، الطابق، الملحقات، المرأب، القبو، السطح…)</p>
<p style="text-align:right;">☐ <strong>الملكية المشتركة (القانون رقم 18.00 كما تم تغييره)</strong>: الجزء المفرز رقم ………، الحصة في الأجزاء المشتركة ……… / ………، نظام الملكية المشتركة المودع بالمحافظة العقارية بتاريخ ……………</p>
<p style="text-align:right;">يباع العقار بجميع مرافقه وتوابعه وارتفاقاته الإيجابية والسلبية، دون استثناء أو تحفظ غير ما هو مذكور في هذا العقد.</p>
<h3 style="text-align:right;"><strong>المادة 3 — أصل الملكية والوضعية القانونية</strong></h3>
<p style="text-align:right;">يصرح البائع بأنه المالك الوحيد للعقار، بعد أن اكتسبه بمقتضى ……………………… بتاريخ ……………، المقيد بالرسم العقاري بتاريخ …………….</p>
<p style="text-align:right;">أُرفقت بهذا العقد <strong>شهادة ملكية</strong> مسلمة من المحافظة العقارية منذ أقل من [30] يوما، تتضمن التقييدات التالية: ☐ لا شيء ☐ رهن رسمي لفائدة …………… بمبلغ ………… درهم ☐ أخرى: ……………</p>
<p style="text-align:right;">يلتزم البائع، على أبعد تقدير عند توقيع العقد النهائي، بـ<strong>رفع اليد</strong> عن كل رهن أو حجز أو تقييد احتياطي مثقل للعقار، وعند الاقتضاء من ثمن البيع.</p>
<p style="text-align:right;">يصرح البائع بأن العقار غير مكرى وغير مشغول، باستثناء: ……………………… (في حالة الكراء، تُرفق نسخة من العقد؛ ويكون عقد الكراء الجاري نافذا في مواجهة المشتري طبقا للقانون رقم 67.12).</p>
<h3 style="text-align:right;"><strong>المادة 4 — الثمن</strong></h3>
<p style="text-align:right;">يتم البيع، في حالة إبرامه، مقابل ثمن إجمالي وجزافي قدره <strong>……………………… درهم ({{asking_price_nombre}} درهم)</strong>، شاملا لكل الضرائب المستحقة عند الاقتضاء، يؤدى كما يلي:</p>
<p style="text-align:right;">– <strong>تسبيق</strong> مؤدى في هذا اليوم: ……………… درهم، بواسطة ☐ تحويل ☐ شيك مضمون رقم ………… مسحوب على ……………، بين يدي الموثق المتلقي الذي يحتفظ به في <strong>حساب الودائع</strong> إلى حين توقيع العقد النهائي؛</p>
<p style="text-align:right;">– <strong>الباقي</strong>: ……………… درهم، يؤدى عند توقيع العقد النهائي، ☐ من الأموال الذاتية ☐ بواسطة القرض البنكي المشار إليه في المادة 6.</p>
<p style="text-align:right;">لا يقبل أي أداء نقدا. ☐ <strong>مشتر غير مقيم</strong>: يؤدى الثمن بعملة أجنبية قابلة للتحويل مستوردة، حفاظا على حق إعادة التحويل المنصوص عليه في نظام الصرف.</p>
<h3 style="text-align:right;"><strong>المادة 5 — طبيعة التسبيق</strong></h3>
<p style="text-align:right;">يتفق الطرفان على أن المبلغ المؤدى يعتبر (يؤشر على خيار واحد):</p>
<p style="text-align:right;">☐ <strong>تسبيقا من الثمن</strong>: يخصم من الثمن عند إتمام البيع؛ وفي حالة إخلال أحد الطرفين، يجوز للطرف الآخر المطالبة بالتنفيذ الجبري أو بالفسخ مع التعويض، ويطبق الشرط الجزائي المنصوص عليه في المادة 11؛</p>
<p style="text-align:right;">☐ <strong>عربونا</strong> بمفهوم الفصول من 288 إلى 290 من ظهير الالتزامات والعقود: في حالة عدول المشتري يبقى مكتسبا للبائع؛ وفي حالة عدول البائع يرده مضاعفا.</p>
<p style="text-align:right;">وفي جميع الأحوال، يُرد التسبيق كاملا إلى المشتري دون أي غرامة إذا لم يتحقق أحد الشروط الواقفة المنصوص عليها في المادة 6 دون خطأ منه.</p>
<h3 style="text-align:right;"><strong>المادة 6 — الشروط الواقفة</strong></h3>
<p style="text-align:right;">يتوقف إتمام البيع على تحقق الشروط الواقفة التالية (الفصول 107 وما يليها من ظهير الالتزامات والعقود):</p>
<p style="text-align:right;">– تسليم <strong>شهادة ملكية</strong> محينة لا تتضمن أي تقييد غير ما هو مذكور في المادة 3 أو ما سيرفع من الثمن؛</p>
<p style="text-align:right;">– ☐ حصول المشتري على <strong>قرض عقاري</strong> بمبلغ ……………… درهم، لمدة ……… سنة، بسعر فائدة أقصاه ……… %، من أي مؤسسة ائتمان، في أجل أقصاه ……………؛ ويلتزم المشتري بإيداع طلبه داخل أجل [15] يوما وبالإدلاء بكل قرار في شأنه؛</p>
<p style="text-align:right;">– إدلاء البائع بشواهد <strong>الوضعية الجبائية</strong> للعقار (الرسم على السكن، الرسم على الخدمات الجماعية)، وعند الاقتضاء، <strong>شهادة وكيل الاتحاد</strong> التي تثبت أداء تكاليف الملكية المشتركة؛</p>
<p style="text-align:right;">– انعدام أي حق شفعة أو ارتفاق تعميري يجعل العقار غير صالح للغرض المعد له (الإدلاء بمذكرة المعلومات التعميرية: ☐ نعم ☐ لا)؛</p>
<p style="text-align:right;">– ☐ شرط آخر: ……………………………………………</p>
<p style="text-align:right;">في حالة عدم تحقق أحد الشروط داخل الأجل المحدد، يصبح هذا الوعد لاغيا بقوة القانون، ما لم يتنازل كتابة الطرف المشترط لفائدته.</p>
<h3 style="text-align:right;"><strong>المادة 7 — إبرام العقد النهائي</strong></h3>
<p style="text-align:right;">يتلقى عقد البيع الرسمي الأستاذ(ة) ……………………، موثق(ة) بـ …………… (أو العدلان ……………………)، <strong>في أجل أقصاه ……………</strong> (يشار إليه فيما يلي بـ «تاريخ الإبرام»).</p>
<p style="text-align:right;">إذا تحققت جميع الشروط الواقفة في هذا التاريخ ورفض أحد الطرفين التوقيع، جاز للطرف الآخر، بعد <strong>إنذار</strong> بقي بدون أثر لمدة [15] يوما، إما المطالبة قضائيا بإتمام البيع جبرا، ويعتبر الحكم النهائي سندا للبيع قابلا للتقييد، وإما التمسك بفسخ الوعد وبالشرط الجزائي المنصوص عليه في المادة 11.</p>
<h3 style="text-align:right;"><strong>المادة 8 — التقييد الاحتياطي</strong></h3>
<p style="text-align:right;">يحق للمشتري أن يطلب، على نفقته، تقييد <strong>تقييد احتياطي</strong> بالرسم العقاري استنادا إلى هذا المحرر الرسمي، طبقا للفصل 85 من ظهير 12 غشت 1913 كما تم تغييره بالقانون رقم 14.07، حفاظا على رتبته. ويمتنع البائع، إلى حين تاريخ الإبرام، عن تخويل أي حق عيني أو كراء أو وعد على العقار لفائدة الغير.</p>
<h3 style="text-align:right;"><strong>المادة 9 — الملكية والانتفاع والمخاطر</strong></h3>
<p style="text-align:right;">يصبح المشتري مالكا بتقييد العقد النهائي بالرسم العقاري. ويتم الانتفاع ☐ عند توقيع العقد النهائي بتسليم المفاتيح، على أن يكون العقار خاليا من كل شغل ☐ غير ذلك: ……………</p>
<p style="text-align:right;">إلى حين تسليم المفاتيح، يبقى العقار على مسؤولية البائع الذي يلتزم بصيانته والإبقاء على تأمينه. وفي حالة وقوع ضرر جسيم، يجوز للمشتري العدول عن الشراء واسترجاع التسبيق.</p>
<h3 style="text-align:right;"><strong>المادة 10 — الضمانات والتصريحات</strong></h3>
<p style="text-align:right;">يلتزم البائع تجاه المشتري بـ<strong>ضمان الاستحقاق</strong> و<strong>ضمان العيوب الخفية</strong> وفق الشروط المنصوص عليها في الفصول 532 وما يليها و549 وما يليها من ظهير الالتزامات والعقود. ☐ يتفق الطرفان على أن العقار يباع على حالته الظاهرة، ويصرح البائع بعدم علمه بأي عيب خفي؛ ولا أثر لهذا الشرط في حالة عيب يعلمه البائع وأخفاه.</p>
<p style="text-align:right;">يصرح البائع: بأن العقار لم يكن محل أي بناء أو تعديل دون ترخيص؛ وبعدم وجود أي مسطرة جارية تتعلق به؛ ☐ وبأن العقار ليس مسكن الأسرة، أو أن الموافقة المطلوبة قد تم الحصول عليها.</p>
<h3 style="text-align:right;"><strong>المادة 11 — الشرط الجزائي</strong></h3>
<p style="text-align:right;">إذا رفض أحد الطرفين إبرام البيع رغم تحقق جميع الشروط الواقفة، أدى للطرف الآخر، على سبيل التعويض الجزافي، مبلغا قدره <strong>……………… درهم</strong> (أي ……… % من الثمن)، دون الإخلال بحق المطالبة بالتنفيذ الجبري. وطبقا للفصل 264 من ظهير الالتزامات والعقود، يجوز للمحكمة تخفيض هذا التعويض أو الرفع منه إذا كان مبالغا فيه أو زهيدا بشكل واضح.</p>
<h3 style="text-align:right;"><strong>المادة 12 — المصاريف والضرائب وأجرة الوسيط</strong></h3>
<p style="text-align:right;">يتحمل <strong>المشتري</strong>: أتعاب الموثق أو العدول، ورسوم التسجيل، ورسوم المحافظة العقارية، ومصاريف التقييد الاحتياطي، حسب التعريفات الجاري بها العمل في تاريخ العقد النهائي.</p>
<p style="text-align:right;">يتحمل <strong>البائع</strong>: الضريبة على الأرباح العقارية (المدونة العامة للضرائب)، ومصاريف رفع اليد، والرسوم المحلية المتأخرة، وتكاليف الملكية المشتركة الحالة في تاريخ العقد النهائي.</p>
<p style="text-align:right;">أجرة الوسيط، المحددة في {{commission_rate_nombre}} % من الثمن شاملة للضرائب (أي {{commission_amount_nombre}} درهم)، يتحملها ☐ البائع ☐ المشتري ☐ الطرفان مناصفة. ولا تستحق إلا عند <strong>توقيع العقد النهائي</strong>، ويؤديها الموثق بناء على تعليمات الطرف المدين بها.</p>
<h3 style="text-align:right;"><strong>المادة 13 — المطابقة ومحاربة غسل الأموال وحماية المعطيات الشخصية</strong></h3>
<p style="text-align:right;">يصرح الطرفان بأن الأموال المستعملة ذات مصدر مشروع، ويلتزمان بالإدلاء للموثق وللوسيط، الخاضعين للقانون رقم 43.05 المتعلق بمكافحة غسل الأموال كما تم تغييره، بكل وثيقة تثبت الهوية ومصدر الأموال.</p>
<p style="text-align:right;">تعالج المعطيات الشخصية للأطراف لغرض تنفيذ هذا العقد فقط، طبقا للقانون رقم 09.08؛ ولكل طرف حق الولوج والتصحيح والتعرض.</p>
<h3 style="text-align:right;"><strong>المادة 14 — الموطن واللغة والنزاعات</strong></h3>
<p style="text-align:right;">يختار الطرفان موطنهما في العناوين المذكورة في مستهل هذا العقد. ويعتبر كل تبليغ صحيحا إذا تم برسالة مضمونة مع إشعار بالتوصل أو بواسطة مفوض قضائي.</p>
<p style="text-align:right;">حرر هذا العقد ☐ باللغة العربية فقط ☐ في نسختين، عربية وفرنسية، توقعان معا؛ وفي هذه الحالة، عند الاختلاف، يعتد بالنص ☐ العربي ☐ الفرنسي.</p>
<p style="text-align:right;">يخضع هذا العقد للقانون المغربي. ويختص بالنظر في كل نزاع المحكمة الابتدائية لموقع العقار.</p>
<h3 style="text-align:right;"><strong>الوثائق المرفقة</strong></h3>
<p style="text-align:right;">– نسخ من وثائق هوية الأطراف؛</p>
<p style="text-align:right;">– شهادة ملكية لا يتجاوز تاريخها [30] يوما؛</p>
<p style="text-align:right;">– التصميم المساحي / تصميم الجزء المفرز؛</p>
<p style="text-align:right;">– ☐ نظام الملكية المشتركة وشهادة وكيل الاتحاد؛</p>
<p style="text-align:right;">– ☐ موافقة مبدئية أو عرض القرض؛</p>
<p style="text-align:right;">– ☐ نسخة من عقد الكراء الجاري؛</p>
<p style="text-align:right;">– وكالة الوسيط.</p>
<p style="text-align:right;">حرر بـ {{agency_city}}، بتاريخ {{date}}، في شكل رسمي، في ……… نظائر أصلية.</p>
<table><tbody><tr><td style="text-align:right;"><strong>البائع</strong><br>«قرئ وصودق عليه»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>المشتري</strong><br>«قرئ وصودق عليه»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>الموثق / العدلان</strong><br>الطابع والتوقيع</td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'vefa', $nom$Contrat préliminaire VEFA (loi n° 44-00)$nom$, 'fr', $html$
<h1 style="text-align:center;"><strong>CONTRAT PRÉLIMINAIRE DE VENTE D'IMMEUBLE EN L'ÉTAT FUTUR D'ACHÈVEMENT (VEFA)</strong></h1>
<p style="text-align:center;"><em><em>Articles 618-1 à 618-20 du DOC, issus de la loi n° 44-00 telle que modifiée par la loi n° 107-12 et par la loi n° 41-25 — Dahir du 12 août 1913 (loi n° 14-07)</em></em></p>
<blockquote><strong>AVERTISSEMENT — RÉGIME IMPÉRATIF.</strong> Le régime de la VEFA est d'ordre public : tout contrat qui n'en respecte pas les règles est <strong>nul</strong> (art. 618-1 et s. DOC). Depuis la loi n° 41-25 (B.O. n° 7526 du 16 juillet 2026), le contrat préliminaire doit être dressé par <strong>acte authentique</strong> (notaire ou adoul).<br><strong>Calendrier.</strong> Un contrat de réservation (avance plafonnée à 5 % du prix, versée sur un compte bloqué, avec faculté de rétractation d'un mois) ne peut être signé qu'après l'obtention du permis de construire ; le contrat préliminaire ne peut l'être qu'après l'achèvement des fondations au niveau du rez-de-chaussée.<br>Avant signature, le rédacteur vérifie : le permis de construire, les plans ne varietur, le cahier des charges, la <strong>garantie de restitution ou d'achèvement</strong> (art. 618-9) et le respect des plafonds légaux de paiement par étape. Les mentions ci-dessous reprennent celles exigées par l'article 618-3 ; elles ne dispensent pas de vérifier le texte en vigueur.</blockquote>
<h3><strong>ENTRE LES SOUSSIGNÉS</strong></h3>
<p style="text-align:justify;"><strong>1. LE VENDEUR (promoteur)</strong> : société {{nom_vendeurs}}, forme ……………, capital ………… MAD, siège ……………………, RC n° ………… (……………), ICE ……………, IF ……………, représentée par …………………… en vertu de ……………………, ci-après « le Vendeur ».</p>
<p style="text-align:justify;"><strong>2. L'ACQUÉREUR</strong> : M./Mme {{nom_acquereurs}}, de nationalité ……………, né(e) le …………… à ……………, CNIE / passeport n° ……………, demeurant à ……………………………, état civil : ……………, ci-après « l'Acquéreur ».</p>
<p style="text-align:justify;">☐ Un contrat de réservation a été conclu entre les parties le ……………, sous la référence {{transaction_reference}} ; l'avance versée à ce titre, soit ……………… MAD, s'impute sur le prix.</p>
<h3><strong>ARTICLE 1 — OBJET</strong></h3>
<p style="text-align:justify;">Le Vendeur s'oblige à édifier et à vendre à l'Acquéreur, qui s'oblige à l'acquérir, l'immeuble désigné à l'article 3, moyennant le prix fixé à l'article 4, payable au fur et à mesure de l'avancement des travaux. Le Vendeur conserve ses droits et pouvoirs de maître de l'ouvrage jusqu'à l'achèvement. La propriété n'est transférée à l'Acquéreur qu'à la signature du <strong>contrat de vente définitif</strong> après achèvement et paiement intégral du prix, et à son inscription sur le titre foncier.</p>
<h3><strong>ARTICLE 2 — PROJET ET AUTORISATIONS</strong></h3>
<p style="text-align:justify;">Projet dénommé « {{property_title}} », sis à {{property_address}}, édifié sur le terrain objet du <strong>titre foncier mère n° ……………</strong> (Conservation foncière de ……………), appartenant au Vendeur.</p>
<p style="text-align:justify;">Permis de construire n° ……………, délivré le …………… par ……………………</p>
<p style="text-align:justify;">Plans architecturaux ne varietur, plans de béton armé et <strong>cahier des charges</strong> : copies conformes déposées auprès du rédacteur du présent acte le ……………, l'Acquéreur reconnaissant en avoir reçu copie.</p>
<p style="text-align:justify;">Achèvement des fondations au niveau du rez-de-chaussée constaté par ……………………… (architecte / bureau d'études) le ……………; attestation annexée.</p>
<h3><strong>ARTICLE 3 — DÉSIGNATION DU BIEN VENDU</strong></h3>
<p style="text-align:justify;">Immeuble / tranche ………, bloc ………, étage {{property_floor}}, lot n° ………, de type {{property_type}}</p>
<p style="text-align:justify;">Superficie : {{property_surface_nombre}} m² (superficie ……………… telle que définie au cahier des charges), comprenant : {{property_consistance}}</p>
<p style="text-align:justify;">Annexes : ☐ parking n° ……… ☐ cave n° ……… ☐ terrasse / jardin privatif de ……… m²</p>
<p style="text-align:justify;">Quote-part dans les parties communes : ……… / ………</p>
<p style="text-align:justify;">Caractéristiques techniques et prestations : selon la <strong>notice descriptive</strong> annexée (gros œuvre, menuiseries, revêtements, sanitaires, électricité, ascenseur…). Toute modification substantielle requiert l'accord écrit de l'Acquéreur.</p>
<h3><strong>ARTICLE 4 — PRIX</strong></h3>
<p style="text-align:justify;">Le prix est fixé de manière <strong>définitive</strong> à ……………… MAD le m², soit un prix global de <strong>{{asking_price_nombre}} MAD</strong> (……………………… dirhams), TVA incluse. Il n'est susceptible d'aucune révision.</p>
<p style="text-align:justify;">Si la superficie livrée diffère de plus de ……… % de la superficie convenue, le prix est ajusté à due proportion, à la hausse ou à la baisse, sur la base du prix au m² ci-dessus.</p>
<h3><strong>ARTICLE 5 — ÉCHÉANCIER DE PAIEMENT</strong></h3>
<p style="text-align:justify;">Le prix est payé par tranches liées à l'avancement des travaux, <strong>dans la limite des plafonds légaux</strong> fixés par la loi n° 107-12. Chaque appel de fonds est accompagné d'une attestation d'avancement établie par l'architecte du projet. Les paiements sont faits par virement sur le compte ……………………… et n'ont jamais lieu en espèces.</p>
<table><thead><tr><th><strong>Étape</strong></th><th><strong>% du prix</strong></th><th><strong>Montant (MAD)</strong></th><th><strong>Date prévisionnelle</strong></th></tr></thead><tbody><tr><td>Contrat de réservation (si conclu)</td><td>5 %</td><td></td><td></td></tr><tr><td>Signature du présent contrat préliminaire (10 % sans réservation préalable)</td><td>5 %</td><td></td><td></td></tr><tr><td>Début / achèvement des fondations</td><td>…… %</td><td></td><td></td></tr><tr><td>Achèvement du gros œuvre</td><td>…… %</td><td></td><td></td></tr><tr><td>Achèvement des finitions</td><td>…… %</td><td></td><td></td></tr><tr><td>Signature du contrat définitif — solde</td><td>…… %</td><td></td><td></td></tr><tr><td>TOTAL</td><td>100 %</td><td></td><td></td></tr></tbody></table>
<h3><strong>ARTICLE 6 — GARANTIE DE RESTITUTION OU D'ACHÈVEMENT</strong></h3>
<p style="text-align:justify;">Conformément à l'article 618-9 du DOC, le Vendeur justifie d'une ☐ <strong>garantie de restitution</strong> des sommes versées ☐ <strong>garantie d'achèvement</strong> des travaux, sous forme de ☐ caution bancaire ☐ assurance ☐ autre caution similaire, délivrée par ……………………, référence n° ……………, en date du ……………, dont copie est annexée. Elle couvre les versements de l'Acquéreur en cas d'inexécution du contrat par le Vendeur.</p>
<h3><strong>ARTICLE 7 — DÉLAI DE LIVRAISON ET RETARD</strong></h3>
<p style="text-align:justify;">Le Vendeur s'engage à achever et à livrer le bien <strong>au plus tard le ……………</strong> (date calendaire). Ce délai ne peut être prorogé que pour cause de force majeure dûment justifiée, et dans la limite prévue par l'article 618-7 du DOC.</p>
<p style="text-align:justify;">En cas de retard imputable au Vendeur, celui-ci doit à l'Acquéreur l'<strong>indemnité de retard</strong> prévue par l'article 618-12 du DOC, calculée sur les sommes versées (1 % par mois de retard, dans la limite de 10 % par an), sans préjudice du droit de l'Acquéreur de demander la résolution dans les conditions légales.</p>
<h3><strong>ARTICLE 8 — PRÉNOTATION</strong></h3>
<p style="text-align:justify;">L'Acquéreur peut requérir une <strong>prénotation</strong> sur le titre foncier dans les conditions de l'article 618-10 du DOC, afin de préserver ses droits jusqu'à l'inscription du contrat définitif. Le Vendeur s'interdit de céder le bien à un tiers ou de le grever d'un droit réel sans l'accord de l'Acquéreur, hormis l'hypothèque garantissant le financement du projet, dont la mainlevée partielle devra être obtenue au plus tard à la signature du contrat définitif.</p>
<h3><strong>ARTICLE 9 — ACHÈVEMENT, LIVRAISON ET CONTRAT DÉFINITIF</strong></h3>
<p style="text-align:justify;">L'achèvement s'entend de l'obtention du <strong>permis d'habiter</strong> (ou certificat de conformité) et de l'éclatement du titre foncier mère permettant l'établissement d'un <strong>titre foncier individuel</strong> pour le bien.</p>
<p style="text-align:justify;">Le Vendeur notifie l'achèvement à l'Acquéreur par lettre recommandée ; un <strong>procès-verbal de livraison</strong> contradictoire est dressé, avec la liste des réserves éventuelles, que le Vendeur s'oblige à lever dans un délai de ……… jours.</p>
<p style="text-align:justify;">Le contrat définitif est signé dans les ……… jours de la notification de l'achèvement, contre paiement du solde. À défaut, la partie diligente peut agir en justice ; le jugement définitif vaut contrat définitif (art. 618-19 DOC).</p>
<p style="text-align:justify;">Le Vendeur demeure tenu des garanties de droit commun, notamment de la garantie des vices de construction prévue par l'article 769 du DOC.</p>
<h3><strong>ARTICLE 10 — RÉSOLUTION</strong></h3>
<p style="text-align:justify;">En cas de résolution du présent contrat du fait de l'une des parties, la partie lésée a droit à l'indemnité prévue par l'article 618-12 du DOC (plafonnée à 15 % du prix), et l'Acquéreur, le cas échéant, à la restitution des sommes versées. Toute stipulation plus défavorable à l'Acquéreur que les dispositions légales est réputée non écrite.</p>
<p style="text-align:justify;">Toute résolution est précédée d'une mise en demeure restée sans effet pendant ……… jours, notifiée par lettre recommandée ou par huissier de justice.</p>
<h3><strong>ARTICLE 11 — CESSION, FRAIS ET IMPÔTS</strong></h3>
<p style="text-align:justify;">L'Acquéreur peut céder ses droits issus du présent contrat, après information du Vendeur ; le cessionnaire est subrogé dans tous ses droits et obligations, y compris le bénéfice de la garantie.</p>
<p style="text-align:justify;">Les frais du présent acte, de la prénotation et du contrat définitif (honoraires, droits d'enregistrement et de conservation foncière) sont à la charge de ☐ l'Acquéreur ☐ autre : ……………… Les frais de l'éclatement du titre mère et de la mainlevée du crédit promoteur sont à la charge du Vendeur.</p>
<h3><strong>ARTICLE 12 — DISPOSITIONS GÉNÉRALES</strong></h3>
<p style="text-align:justify;">Les parties déclarent l'origine licite des fonds (loi n° 43-05 telle que modifiée) et consentent au traitement de leurs données personnelles aux seules fins du présent contrat (loi n° 09-08).</p>
<p style="text-align:justify;">Domicile est élu aux adresses ci-dessus. L'acte est établi ☐ en langue française uniquement ☐ en deux versions, française et arabe, signées ensemble ; dans ce cas, en cas de divergence, la version ☐ arabe ☐ française prévaut. Droit applicable : droit marocain. Juridiction compétente : tribunal du lieu de situation de l'immeuble.</p>
<h3><strong>PIÈCES ANNEXÉES</strong></h3>
<p style="text-align:justify;">– Permis de construire ;</p>
<p style="text-align:justify;">– Plans ne varietur et plan du lot ;</p>
<p style="text-align:justify;">– Cahier des charges et notice descriptive ;</p>
<p style="text-align:justify;">– Attestation d'achèvement des fondations au niveau du rez-de-chaussée ;</p>
<p style="text-align:justify;">– Référence et copie de la garantie (art. 618-9) ;</p>
<p style="text-align:justify;">– Certificat de propriété du titre foncier mère ;</p>
<p style="text-align:justify;">– ☐ Contrat de réservation et justificatif de l'avance.</p>
<p style="text-align:justify;">Fait à {{agency_city}}, le {{date}}, en la forme authentique.</p>
<table><tbody><tr><td><strong>Le Vendeur</strong><br><em>« Lu et approuvé »</em><br>Signature légalisée</td><td><strong>L'Acquéreur</strong><br><em>« Lu et approuvé »</em><br>Signature légalisée</td><td><strong>Le Notaire / les Adouls</strong><br><em>Sceau et signature</em></td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'vefa', $nom$عقد البيع الابتدائي لعقار في طور الإنجاز$nom$, 'ar', $html$
<h1 style="text-align:center;"><strong>عقد البيع الابتدائي لعقار في طور الإنجاز</strong></h1>
<p style="text-align:center;"><em>الفصول من 618-1 إلى 618-20 من ظهير الالتزامات والعقود، الصادرة بموجب القانون رقم 44.00 كما تم تغييره بالقانون رقم 107.12 وبالقانون رقم 41.25 — ظهير 12 غشت 1913 (القانون رقم 14.07)</em></p>
<blockquote style="text-align:right;"><strong>تنبيه — نظام آمر.</strong> يعتبر نظام بيع العقار في طور الإنجاز من النظام العام: ويكون <strong>باطلا</strong> كل عقد لا يحترم قواعده (الفصول 618-1 وما يليها من ق.ل.ع). ومنذ القانون رقم 41.25 (الجريدة الرسمية عدد 7526 بتاريخ 16 يوليوز 2026)، يجب تحرير العقد الابتدائي في <strong>محرر رسمي</strong> (موثق أو عدول).<br><strong>التسلسل الزمني.</strong> لا يجوز توقيع عقد التخصيص (تسبيق لا يتجاوز 5 % من الثمن يودع في حساب مجمد، مع حق التراجع داخل أجل شهر) إلا بعد الحصول على رخصة البناء؛ ولا يجوز توقيع العقد الابتدائي إلا بعد إنجاز الأساسات على مستوى الطابق الأرضي.<br>قبل التوقيع، يتحقق المحرر من: رخصة البناء، والتصاميم غير القابلة للتغيير، ودفتر التحملات، و<strong>ضمانة الاسترجاع أو الإتمام</strong> (الفصل 618-9)، واحترام السقوف القانونية للأداء حسب المراحل. وتتضمن البنود أدناه البيانات التي يوجبها الفصل 618-3، دون أن يعفي ذلك من التحقق من النص الجاري به العمل.</blockquote>
<h3 style="text-align:right;"><strong>بين الموقعين أسفله</strong></h3>
<p style="text-align:right;"><strong>1. البائع (المنعش العقاري)</strong>: شركة {{nom_vendeurs}}، شكلها ……………، رأسمالها ………… درهم، مقرها ……………………، سجل تجاري رقم ………… (……………)، التعريف الموحد ……………، التعريف الضريبي ……………، يمثلها …………………… بمقتضى ……………………، يشار إليها فيما يلي بـ «البائع».</p>
<p style="text-align:right;"><strong>2. المشتري</strong>: السيد(ة) {{nom_acquereurs}}، الجنسية ……………، المزداد(ة) بتاريخ …………… بـ ……………، البطاقة الوطنية / جواز السفر رقم ……………، الساكن(ة) بـ ……………………………، الحالة المدنية: ……………، يشار إليه فيما يلي بـ «المشتري».</p>
<p style="text-align:right;">☐ أبرم الطرفان عقد تخصيص بتاريخ ……………، تحت المرجع {{transaction_reference}}؛ ويخصم من الثمن التسبيق المؤدى بموجبه، أي ……………… درهم.</p>
<h3 style="text-align:right;"><strong>المادة 1 — الموضوع</strong></h3>
<p style="text-align:right;">يلتزم البائع ببناء العقار المبين في المادة 3 وبيعه للمشتري الذي يلتزم بشرائه، مقابل الثمن المحدد في المادة 4، يؤدى تبعا لتقدم الأشغال. ويحتفظ البائع بحقوقه وسلطاته كصاحب المشروع إلى حين الإنجاز. ولا تنتقل الملكية إلى المشتري إلا عند توقيع <strong>عقد البيع النهائي</strong> بعد الإنجاز وأداء الثمن كاملا، وتقييده بالرسم العقاري.</p>
<h3 style="text-align:right;"><strong>المادة 2 — المشروع والرخص</strong></h3>
<p style="text-align:right;">مشروع يحمل اسم «{{property_title}}»، الكائن بـ {{property_address}}، المشيد على الأرض موضوع <strong>الرسم العقاري الأم عدد ……………</strong> (المحافظة العقارية بـ ……………)، المملوكة للبائع.</p>
<p style="text-align:right;">رخصة البناء رقم ……………، المسلمة بتاريخ …………… من طرف ……………………</p>
<p style="text-align:right;">التصاميم المعمارية غير القابلة للتغيير، وتصاميم الخرسانة المسلحة، و<strong>دفتر التحملات</strong>: نسخ مطابقة مودعة لدى محرر هذا العقد بتاريخ ……………، ويقر المشتري بتسلمه نسخة منها.</p>
<p style="text-align:right;">تمت معاينة إنجاز الأساسات على مستوى الطابق الأرضي من طرف ……………………… (المهندس المعماري / مكتب الدراسات) بتاريخ ……………؛ والشهادة مرفقة.</p>
<h3 style="text-align:right;"><strong>المادة 3 — تعيين العقار المبيع</strong></h3>
<p style="text-align:right;">العمارة / الشطر ………، البلوك ………، الطابق {{property_floor}}، الجزء رقم ………، من نوع {{property_type}}</p>
<p style="text-align:right;">المساحة: {{property_surface_nombre}} م² (مساحة ……………… كما هي محددة في دفتر التحملات)، تشمل: {{property_consistance}}</p>
<p style="text-align:right;">الملحقات: ☐ مرأب رقم ……… ☐ قبو رقم ……… ☐ سطح / حديقة خاصة مساحتها ……… م²</p>
<p style="text-align:right;">الحصة في الأجزاء المشتركة: ……… / ………</p>
<p style="text-align:right;">المواصفات التقنية والتجهيزات: وفق <strong>البيان الوصفي</strong> المرفق (الأشغال الكبرى، النجارة، التكسيات، التجهيزات الصحية، الكهرباء، المصعد…). ويستلزم كل تعديل جوهري الموافقة الكتابية للمشتري.</p>
<h3 style="text-align:right;"><strong>المادة 4 — الثمن</strong></h3>
<p style="text-align:right;">حدد الثمن بصفة <strong>نهائية</strong> في ……………… درهم للمتر المربع، أي ثمن إجمالي قدره <strong>{{asking_price_nombre}} درهم</strong> (……………………… درهم)، شاملا للضريبة على القيمة المضافة، ولا يقبل أي مراجعة.</p>
<p style="text-align:right;">إذا اختلفت المساحة المسلمة بأكثر من ……… % عن المساحة المتفق عليها، يعدل الثمن بالزيادة أو النقصان بنسبة الفرق، على أساس ثمن المتر المربع المذكور أعلاه.</p>
<h3 style="text-align:right;"><strong>المادة 5 — جدول الأداءات</strong></h3>
<p style="text-align:right;">يؤدى الثمن على دفعات مرتبطة بتقدم الأشغال، <strong>في حدود السقوف القانونية</strong> المحددة بالقانون رقم 107.12. ويرفق كل طلب أداء بشهادة تقدم الأشغال يحررها مهندس المشروع. وتتم الأداءات بتحويل إلى الحساب ……………………… ولا تتم أبدا نقدا.</p>
<table><thead><tr><th style="text-align:right;"><strong>المرحلة</strong></th><th style="text-align:right;"><strong>النسبة من الثمن</strong></th><th style="text-align:right;"><strong>المبلغ (درهم)</strong></th><th style="text-align:right;"><strong>التاريخ المتوقع</strong></th></tr></thead><tbody><tr><td style="text-align:right;">عقد التخصيص (إن وجد)</td><td style="text-align:right;">5 %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">توقيع هذا العقد الابتدائي (10 % في غياب تخصيص مسبق)</td><td style="text-align:right;">5 %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">بداية / إنجاز الأساسات</td><td style="text-align:right;">…… %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">إنجاز الأشغال الكبرى</td><td style="text-align:right;">…… %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">إنجاز أشغال التشطيب</td><td style="text-align:right;">…… %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">توقيع العقد النهائي — الباقي</td><td style="text-align:right;">…… %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">المجموع</td><td style="text-align:right;">100 %</td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr></tbody></table>
<h3 style="text-align:right;"><strong>المادة 6 — ضمانة الاسترجاع أو الإتمام</strong></h3>
<p style="text-align:right;">طبقا للفصل 618-9 من ظهير الالتزامات والعقود، يثبت البائع توفره على ☐ <strong>ضمانة لاسترجاع</strong> المبالغ المؤداة ☐ <strong>ضمانة لإتمام</strong> الأشغال، في شكل ☐ كفالة بنكية ☐ تأمين ☐ كفالة مماثلة أخرى، مسلمة من طرف ……………………، تحت المرجع رقم ……………، بتاريخ ……………، وتُرفق نسخة منها. وتغطي أداءات المشتري في حالة عدم تنفيذ البائع للعقد.</p>
<h3 style="text-align:right;"><strong>المادة 7 — أجل التسليم والتأخير</strong></h3>
<p style="text-align:right;">يلتزم البائع بإنجاز العقار وتسليمه <strong>في أجل أقصاه ……………</strong> (تاريخ محدد). ولا يمكن تمديد هذا الأجل إلا بسبب قوة قاهرة مثبتة، وفي الحدود المنصوص عليها في الفصل 618-7 من ظهير الالتزامات والعقود.</p>
<p style="text-align:right;">في حالة تأخير يعزى إلى البائع، يلتزم هذا الأخير بأداء <strong>التعويض عن التأخير</strong> المنصوص عليه في الفصل 618-12 من ظهير الالتزامات والعقود، يحتسب على المبالغ المؤداة (1 % عن كل شهر تأخير، في حدود 10 % في السنة)، دون الإخلال بحق المشتري في المطالبة بالفسخ وفق الشروط القانونية.</p>
<h3 style="text-align:right;"><strong>المادة 8 — التقييد الاحتياطي</strong></h3>
<p style="text-align:right;">يجوز للمشتري أن يطلب <strong>تقييدا احتياطيا</strong> بالرسم العقاري وفق الشروط المنصوص عليها في الفصل 618-10 من ظهير الالتزامات والعقود، حفاظا على حقوقه إلى حين تقييد العقد النهائي. ويمتنع البائع عن تفويت العقار للغير أو إثقاله بحق عيني دون موافقة المشتري، باستثناء الرهن الضامن لتمويل المشروع، الذي يجب الحصول على رفع اليد الجزئي عنه في أجل أقصاه تاريخ توقيع العقد النهائي.</p>
<h3 style="text-align:right;"><strong>المادة 9 — الإنجاز والتسليم والعقد النهائي</strong></h3>
<p style="text-align:right;">يقصد بالإنجاز الحصول على <strong>رخصة السكن</strong> (أو شهادة المطابقة) وتجزئة الرسم العقاري الأم بما يسمح بإحداث <strong>رسم عقاري مستقل</strong> للعقار.</p>
<p style="text-align:right;">يبلغ البائع المشتري بالإنجاز برسالة مضمونة؛ ويحرر <strong>محضر تسليم</strong> حضوري مع لائحة التحفظات المحتملة، التي يلتزم البائع برفعها داخل أجل ……… يوما.</p>
<p style="text-align:right;">يوقع العقد النهائي داخل ……… يوما من تاريخ التبليغ بالإنجاز، مقابل أداء الباقي. وفي حالة الامتناع، يجوز للطرف الأكثر حرصا اللجوء إلى القضاء؛ ويعتبر الحكم النهائي بمثابة عقد نهائي (الفصل 618-19 ق.ل.ع).</p>
<p style="text-align:right;">يبقى البائع ملزما بالضمانات المقررة في القواعد العامة، ولا سيما ضمان عيوب البناء المنصوص عليه في الفصل 769 من ظهير الالتزامات والعقود.</p>
<h3 style="text-align:right;"><strong>المادة 10 — الفسخ</strong></h3>
<p style="text-align:right;">في حالة فسخ هذا العقد بفعل أحد الطرفين، يحق للطرف المتضرر الحصول على التعويض المنصوص عليه في الفصل 618-12 من ظهير الالتزامات والعقود (في حدود 15 % من الثمن)، كما يحق للمشتري، عند الاقتضاء، استرجاع المبالغ المؤداة. ويعتبر كأن لم يكن كل شرط أقل فائدة للمشتري من المقتضيات القانونية.</p>
<p style="text-align:right;">يسبق كل فسخ إنذار يبقى بدون أثر لمدة ……… يوما، يبلغ برسالة مضمونة أو بواسطة مفوض قضائي.</p>
<h3 style="text-align:right;"><strong>المادة 11 — التفويت والمصاريف والضرائب</strong></h3>
<p style="text-align:right;">يجوز للمشتري تفويت حقوقه الناشئة عن هذا العقد بعد إخبار البائع؛ ويحل المفوت له محله في جميع حقوقه والتزاماته، بما في ذلك الاستفادة من الضمانة.</p>
<p style="text-align:right;">تقع مصاريف هذا العقد والتقييد الاحتياطي والعقد النهائي (الأتعاب ورسوم التسجيل والمحافظة العقارية) على عاتق ☐ المشتري ☐ غيره: ……………… وتقع مصاريف تجزئة الرسم الأم ورفع اليد عن قرض المنعش على عاتق البائع.</p>
<h3 style="text-align:right;"><strong>المادة 12 — مقتضيات عامة</strong></h3>
<p style="text-align:right;">يصرح الطرفان بمشروعية مصدر الأموال (القانون رقم 43.05 كما تم تغييره) ويوافقان على معالجة معطياتهما الشخصية لغرض هذا العقد فقط (القانون رقم 09.08).</p>
<p style="text-align:right;">يختار الطرفان موطنهما في العناوين المذكورة أعلاه. وحرر العقد ☐ باللغة العربية فقط ☐ في نسختين، عربية وفرنسية، توقعان معا؛ وفي هذه الحالة، عند الاختلاف، يعتد بالنص ☐ العربي ☐ الفرنسي. القانون الواجب التطبيق: القانون المغربي. المحكمة المختصة: محكمة موقع العقار.</p>
<h3 style="text-align:right;"><strong>الوثائق المرفقة</strong></h3>
<p style="text-align:right;">– رخصة البناء؛</p>
<p style="text-align:right;">– التصاميم غير القابلة للتغيير وتصميم الجزء؛</p>
<p style="text-align:right;">– دفتر التحملات والبيان الوصفي؛</p>
<p style="text-align:right;">– شهادة إنجاز الأساسات على مستوى الطابق الأرضي؛</p>
<p style="text-align:right;">– مرجع ونسخة الضمانة (الفصل 618-9)؛</p>
<p style="text-align:right;">– شهادة ملكية الرسم العقاري الأم؛</p>
<p style="text-align:right;">– ☐ عقد التخصيص وما يثبت أداء التسبيق.</p>
<p style="text-align:right;">حرر بـ {{agency_city}}، بتاريخ {{date}}، في شكل رسمي.</p>
<table><tbody><tr><td style="text-align:right;"><strong>البائع</strong><br>«قرئ وصودق عليه»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>المشتري</strong><br>«قرئ وصودق عليه»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>الموثق / العدلان</strong><br>الطابع والتوقيع</td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'lease', $nom$Bail d'habitation — loi n° 67-12$nom$, 'fr', $html$
<h1 style="text-align:center;"><strong>CONTRAT DE BAIL À USAGE D'HABITATION</strong></h1>
<p style="text-align:center;"><em><em>Loi n° 67-12 régissant les rapports contractuels entre bailleurs et locataires des locaux à usage d'habitation ou à usage professionnel — articles 627 et suivants du DOC</em></em></p>
<blockquote><strong>Mode d'emploi.</strong> La loi n° 67-12 s'applique aux locaux d'habitation <strong>vides ou meublés</strong> loués pour plus de 30 jours ; la location saisonnière plus courte en est exclue. Son article 3 exige un <strong>bail écrit à date certaine</strong> : faire légaliser les signatures ou enregistrer le bail. Sans date certaine, le bailleur perd l'accès aux procédures simplifiées de recouvrement et d'expulsion prévues par la loi.<br>Cocher « vide » ou « meublé » à l'article 2. En location meublée, l'<strong>Annexe 2 (inventaire)</strong> est obligatoire. L'<strong>Annexe 1 (état des lieux)</strong> est à établir contradictoirement à l'entrée puis à la sortie.</blockquote>
<h3><strong>ENTRE LES SOUSSIGNÉS</strong></h3>
<p style="text-align:justify;"><strong>1. LE BAILLEUR</strong> : M./Mme / Société {{nom_bailleurs}}, CNIE / RC n° ……………, demeurant / siège à ……………………………, tél. ……………, e-mail ……………</p>
<p style="text-align:justify;">☐ Représenté par l'agence {{agency_name}}, RC n° {{agency_rc}}, ICE {{agency_ice}}, en vertu d'un mandat de gestion du ……………, ci-après « le Bailleur ».</p>
<p style="text-align:justify;"><strong>2. LE LOCATAIRE</strong> : M./Mme {{nom_locataires}}, de nationalité ……………, né(e) le ……………, CNIE / passeport n° ……………, profession ……………, demeurant actuellement à ……………………………, tél. ……………, ci-après « le Locataire ».</p>
<p style="text-align:justify;">☐ En cas de colocation, les colocataires sont tenus <strong>solidairement</strong> du paiement du loyer et des charges.</p>
<h3><strong>ARTICLE 1 — OBJET ET DESTINATION</strong></h3>
<p style="text-align:justify;">Le Bailleur donne à bail au Locataire, qui accepte, le local désigné à l'article 2, à usage <strong>exclusif d'habitation principale</strong> du Locataire et de sa famille. Toute activité commerciale, professionnelle ou de location touristique de courte durée y est interdite sans l'accord écrit du Bailleur.</p>
<h3><strong>ARTICLE 2 — DÉSIGNATION DU LOCAL</strong></h3>
<p style="text-align:justify;">Adresse : {{property_address}}, ville {{property_city}}</p>
<p style="text-align:justify;">Type : ☐ appartement ☐ villa ☐ maison ☐ studio — étage {{property_floor}}, superficie {{property_surface_nombre}} m², composé de : {{property_consistance}}</p>
<p style="text-align:justify;">Dépendances : ☐ parking ☐ cave ☐ terrasse ☐ jardin ☐ autre : ……………</p>
<p style="text-align:justify;">Équipements : ☐ cuisine équipée ☐ chauffe-eau ☐ climatisation ☐ ascenseur ☐ interphone ☐ antenne / fibre</p>
<p style="text-align:justify;">Titre foncier n° …………… (si immatriculé).</p>
<p style="text-align:justify;">Le local est loué : ☐ <strong>vide</strong> ☐ <strong>meublé</strong>, le mobilier étant décrit à l'<strong>Annexe 2 (inventaire)</strong>, qui fait partie intégrante du bail.</p>
<h3><strong>ARTICLE 3 — DURÉE</strong></h3>
<p style="text-align:justify;">Le bail est conclu pour une durée de ……… (……) ☐ an(s) ☐ mois, à compter du …………… pour se terminer le …………… Il se renouvelle ensuite par <strong>tacite reconduction</strong> pour des périodes successives de même durée, sauf congé donné dans les conditions de l'article 13.</p>
<h3><strong>ARTICLE 4 — LOYER</strong></h3>
<p style="text-align:justify;">Le loyer mensuel est librement fixé à <strong>{{property_rent_nombre}} MAD</strong> (……………………… dirhams), payable <strong>d'avance</strong>, au plus tard le ……… de chaque mois, par ☐ virement sur le compte RIB ……………………… ☐ chèque ☐ autre : ……………</p>
<p style="text-align:justify;">Le Bailleur, ou son mandataire, délivre une <strong>quittance</strong> pour chaque paiement. Le paiement en espèces, s'il est accepté, donne obligatoirement lieu à quittance.</p>
<h3><strong>ARTICLE 5 — CHARGES ET TAXES</strong></h3>
<p style="text-align:justify;">Sont à la charge du <strong>Locataire</strong> : les consommations d'eau, d'électricité, de gaz, de téléphone et d'internet, dont il souscrit les abonnements à son nom ; ☐ les charges de copropriété récupérables, forfaitaires de {{property_condo_fees_nombre}} MAD/mois ☐ sur justificatifs.</p>
<p style="text-align:justify;">Sont à la charge du <strong>Bailleur</strong> : l'impôt sur les revenus fonciers, les grosses réparations et les charges de copropriété non récupérables.</p>
<p style="text-align:justify;">La taxe de services communaux et, le cas échéant, la taxe d'habitation sont réparties comme suit : ☐ Bailleur ☐ Locataire ☐ autre : ……………</p>
<h3><strong>ARTICLE 6 — DÉPÔT DE GARANTIE</strong></h3>
<p style="text-align:justify;">Le Locataire verse ce jour un dépôt de garantie de <strong>……………… MAD</strong>, correspondant à ……… mois de loyer, <strong>dans la limite légale de deux mois de loyer</strong> (loi n° 67-12). Ce dépôt ne porte pas intérêt et ne peut en aucun cas être imputé par le Locataire sur le dernier loyer.</p>
<p style="text-align:justify;">Il est restitué au Locataire dans un délai de ……… jours suivant la remise des clés, déduction faite des sommes dues au Bailleur (loyers, charges, réparations locatives), justifiées par comparaison des états des lieux d'entrée et de sortie.</p>
<h3><strong>ARTICLE 7 — RÉVISION DU LOYER</strong></h3>
<p style="text-align:justify;">Les parties conviennent que le loyer pourra être révisé ☐ tous les trois ans ☐ autre : ……………, au taux de ……… % (révision conventionnelle). À défaut d'accord, la révision obéit à la loi n° 67-12 : elle ne peut intervenir qu'à l'expiration d'un délai de <strong>trois ans</strong> et l'augmentation ne peut excéder <strong>8 %</strong> pour un local d'habitation, sous réserve des pouvoirs du tribunal prévus par la loi.</p>
<h3><strong>ARTICLE 8 — OBLIGATIONS DU BAILLEUR</strong></h3>
<p style="text-align:justify;">Le Bailleur s'oblige à :</p>
<p style="text-align:justify;">– délivrer le local en bon état d'habitation, avec ses équipements en état de fonctionnement ;</p>
<p style="text-align:justify;">– assurer au Locataire la jouissance paisible du local et le garantir des vices qui en empêchent l'usage ;</p>
<p style="text-align:justify;">– effectuer les <strong>grosses réparations</strong> et celles nécessaires au maintien du local en état de servir ;</p>
<p style="text-align:justify;">– délivrer quittance de chaque paiement ;</p>
<p style="text-align:justify;">– ne pas modifier la forme ou la destination du local en cours de bail.</p>
<h3><strong>ARTICLE 9 — OBLIGATIONS DU LOCATAIRE</strong></h3>
<p style="text-align:justify;">Le Locataire s'oblige à :</p>
<p style="text-align:justify;">– payer le loyer et les charges aux termes convenus ;</p>
<p style="text-align:justify;">– user du local en bon père de famille, conformément à sa destination et au règlement de copropriété ;</p>
<p style="text-align:justify;">– prendre en charge les <strong>réparations locatives</strong> et l'entretien courant ;</p>
<p style="text-align:justify;">– n'effectuer aucune transformation sans l'accord écrit du Bailleur ;</p>
<p style="text-align:justify;">– signaler sans délai tout sinistre ou dégradation ;</p>
<p style="text-align:justify;">– permettre l'accès au local pour les réparations urgentes et, en fin de bail, pour les visites ;</p>
<p style="text-align:justify;">– ☐ souscrire une assurance multirisque habitation et en justifier à première demande ;</p>
<p style="text-align:justify;">– restituer le local en l'état décrit à l'état des lieux d'entrée, sauf usure normale.</p>
<h3><strong>ARTICLE 10 — SOUS-LOCATION ET CESSION</strong></h3>
<p style="text-align:justify;">Toute sous-location, totale ou partielle, et toute cession du bail sont <strong>interdites</strong> sans l'accord exprès et écrit du Bailleur.</p>
<h3><strong>ARTICLE 11 — ÉTAT DES LIEUX ET INVENTAIRE</strong></h3>
<p style="text-align:justify;">Un <strong>état des lieux</strong> contradictoire est établi et signé par les parties lors de la remise des clés (Annexe 1), puis lors de leur restitution. En location meublée, l'<strong>inventaire</strong> (Annexe 2) est vérifié aux mêmes dates. À défaut d'état des lieux d'entrée, le local est présumé avoir été délivré en bon état, sauf preuve contraire.</p>
<h3><strong>ARTICLE 12 — DÉFAUT DE PAIEMENT</strong></h3>
<p style="text-align:justify;">En cas de non-paiement du loyer à son échéance, le Bailleur peut adresser au Locataire une <strong>mise en demeure</strong> de payer dans les formes et délais prévus par la loi n° 67-12. Faute de paiement dans le délai légal, il peut saisir le tribunal compétent aux fins de recouvrement, de résiliation du bail et d'expulsion, selon la procédure prévue par cette loi.</p>
<h3><strong>ARTICLE 13 — CONGÉ ET FIN DU BAIL</strong></h3>
<p style="text-align:justify;"><strong>Par le Locataire</strong> : il peut mettre fin au bail à tout moment, moyennant un préavis de ……… mois, notifié par lettre recommandée avec accusé de réception ou par huissier de justice.</p>
<p style="text-align:justify;"><strong>Par le Bailleur</strong> : il ne peut mettre fin au bail que pour l'un des <strong>motifs prévus par la loi n° 67-12</strong> (notamment la reprise pour habiter lui-même ou ses proches, la démolition ou la reconstruction, les travaux nécessitant l'évacuation, ou un manquement grave du Locataire), par un congé motivé et notifié dans les formes et délais légaux, sous réserve des indemnités prévues par la loi.</p>
<p style="text-align:justify;">À sa sortie, le Locataire justifie du paiement de ses dernières factures d'eau et d'électricité.</p>
<h3><strong>ARTICLE 14 — DATE CERTAINE, FRAIS ET LITIGES</strong></h3>
<p style="text-align:justify;">Pour satisfaire à l'article 3 de la loi n° 67-12, le présent bail reçoit <strong>date certaine</strong> par ☐ la légalisation des signatures des parties ☐ son enregistrement. Les frais correspondants sont supportés ☐ par moitié ☐ par ……………</p>
<p style="text-align:justify;">☐ Les honoraires de location de l'agence, soit {{commission_amount_nombre}} MAD TTC, sont à la charge de ……………</p>
<p style="text-align:justify;">Les données personnelles du Locataire sont traitées aux seules fins de la gestion du bail (loi n° 09-08). Domicile est élu dans le local loué pour le Locataire et à l'adresse ci-dessus pour le Bailleur. Le bail est établi ☐ en langue française uniquement ☐ en deux versions, française et arabe, signées ensemble ; dans ce cas, en cas de divergence, la version ☐ arabe ☐ française prévaut. Tout litige relève du tribunal de première instance du lieu de situation du local.</p>
<p style="text-align:justify;">Fait à {{agency_city}}, le {{date}}, en ……… exemplaires originaux, dont un pour chaque partie. Annexes : 1. État des lieux — 2. ☐ Inventaire du mobilier — 3. Copies des pièces d'identité.</p>
<table><tbody><tr><td><strong>Le Bailleur (ou son mandataire)</strong><br><em>« Lu et approuvé »</em><br>Signature légalisée</td><td><strong>Le Locataire</strong><br><em>« Lu et approuvé »</em><br>Signature légalisée</td></tr></tbody></table>
<h2 style="text-align:center;"><strong>ANNEXE 1 — ÉTAT DES LIEUX D'ENTRÉE ET DE SORTIE</strong></h2>
<p style="text-align:center;"><em>Établi contradictoirement — cotation : N = neuf · B = bon · U = usagé · M = mauvais</em></p>
<p style="text-align:justify;">Adresse du local : {{property_address}}</p>
<p style="text-align:justify;">État des lieux d'<strong>entrée</strong> le …………… — Relevés compteurs : eau ………… / électricité ………… — Nombre de clés remises : ……</p>
<p style="text-align:justify;">État des lieux de <strong>sortie</strong> le …………… — Relevés compteurs : eau ………… / électricité ………… — Nombre de clés restituées : ……</p>
<p style="text-align:justify;">Éléments à contrôler dans chaque pièce : sols, murs, plafonds, portes, fenêtres, électricité, plomberie, équipements.</p>
<table><thead><tr><th><strong>Pièce</strong></th><th><strong>État entrée</strong></th><th><strong>État sortie</strong></th><th><strong>Observations</strong></th></tr></thead><tbody><tr><td>Entrée / couloir</td><td></td><td></td><td></td></tr><tr><td>Séjour / salon</td><td></td><td></td><td></td></tr><tr><td>Cuisine</td><td></td><td></td><td></td></tr><tr><td>Chambre 1</td><td></td><td></td><td></td></tr><tr><td>Chambre 2</td><td></td><td></td><td></td></tr><tr><td>Chambre 3</td><td></td><td></td><td></td></tr><tr><td>Salle de bain / douche</td><td></td><td></td><td></td></tr><tr><td>WC</td><td></td><td></td><td></td></tr><tr><td>Balcon / terrasse</td><td></td><td></td><td></td></tr><tr><td>Buanderie / cave / parking</td><td></td><td></td><td></td></tr></tbody></table>
<p style="text-align:justify;">Photos datées jointes : ☐ oui (nombre : ……) ☐ non. Réserves particulières : ……………………………………………………………………</p>
<table><tbody><tr><td><strong>Bailleur — entrée</strong><br> </td><td><strong>Locataire — entrée</strong><br> </td><td><strong>Bailleur — sortie</strong><br> </td><td><strong>Locataire — sortie</strong><br> </td></tr></tbody></table>
<h2 style="text-align:center;"><strong>ANNEXE 2 — INVENTAIRE DU MOBILIER (LOCATION MEUBLÉE)</strong></h2>
<p style="text-align:center;"><em>À compléter uniquement si le local est loué meublé</em></p>
<table><thead><tr><th><strong>Pièce</strong></th><th><strong>Désignation du meuble / équipement</strong></th><th><strong>Qté</strong></th><th><strong>État entrée</strong></th><th><strong>État sortie</strong></th></tr></thead><tbody><tr><td>Séjour</td><td>Canapé / salon marocain, table, chaises, TV, rideaux</td><td></td><td></td><td></td></tr><tr><td>Cuisine</td><td>Réfrigérateur, cuisinière / plaques, four, micro-ondes, vaisselle, ustensiles</td><td></td><td></td><td></td></tr><tr><td>Chambre 1</td><td>Lit, matelas, armoire, table de chevet, rideaux</td><td></td><td></td><td></td></tr><tr><td>Chambre 2</td><td></td><td></td><td></td><td></td></tr><tr><td>Salle de bain</td><td>Machine à laver, miroir, accessoires</td><td></td><td></td><td></td></tr><tr><td>Autres</td><td>Climatiseurs (nombre : ……), linge de maison, luminaires</td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
<p style="text-align:justify;">Le Locataire reconnaît avoir reçu les meubles et équipements ci-dessus en l'état indiqué et s'engage à les restituer dans le même état, sauf usure normale. Tout élément manquant ou détérioré sera remplacé ou indemnisé à sa valeur de remplacement.</p>
<table><tbody><tr><td><strong>Le Bailleur</strong><br> </td><td><strong>Le Locataire</strong><br> </td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'lease', $nom$عقد كراء محل معد للسكنى$nom$, 'ar', $html$
<h1 style="text-align:center;"><strong>عقد كراء محل معد للسكنى</strong></h1>
<p style="text-align:center;"><em>القانون رقم 67.12 المتعلق بتنظيم العلاقات التعاقدية بين المكري والمكتري للمحلات المعدة للسكنى أو للاستعمال المهني — الفصول 627 وما يليها من ظهير الالتزامات والعقود</em></p>
<blockquote style="text-align:right;"><strong>طريقة الاستعمال.</strong> يطبق القانون رقم 67.12 على المحلات المعدة للسكنى <strong>الفارغة أو المفروشة</strong> المكراة لمدة تتجاوز 30 يوما؛ ويستثنى منه الكراء الموسمي الأقصر مدة. وتوجب المادة 3 منه أن يكون <strong>عقد الكراء كتابيا وثابت التاريخ</strong>: تُصحَّح الإمضاءات أو يُسجَّل العقد. وفي غياب التاريخ الثابت، يفقد المكري حق اللجوء إلى المساطر المبسطة للاستخلاص والإفراغ المنصوص عليها في القانون.<br>يؤشر على «فارغ» أو «مفروش» في المادة 2. وفي الكراء المفروش، يكون <strong>الملحق 2 (الجرد)</strong> إلزاميا. ويُحرَّر <strong>الملحق 1 (بيان حالة المحل)</strong> حضوريا عند الدخول ثم عند الخروج.</blockquote>
<h3 style="text-align:right;"><strong>بين الموقعين أسفله</strong></h3>
<p style="text-align:right;"><strong>1. المكري</strong>: السيد(ة) / الشركة {{nom_bailleurs}}، البطاقة الوطنية / السجل التجاري رقم ……………، الساكن(ة) / مقرها بـ ……………………………، الهاتف ……………، البريد الإلكتروني ……………</p>
<p style="text-align:right;">☐ تمثله وكالة {{agency_name}}، سجل تجاري رقم {{agency_rc}}، التعريف الموحد {{agency_ice}}، بمقتضى وكالة تسيير مؤرخة في ……………، يشار إليه فيما يلي بـ «المكري».</p>
<p style="text-align:right;"><strong>2. المكتري</strong>: السيد(ة) {{nom_locataires}}، الجنسية ……………، المزداد(ة) بتاريخ ……………، البطاقة الوطنية / جواز السفر رقم ……………، المهنة ……………، الساكن(ة) حاليا بـ ……………………………، الهاتف ……………، يشار إليه فيما يلي بـ «المكتري».</p>
<p style="text-align:right;">☐ في حالة الكراء المشترك، يلتزم المكترون <strong>على وجه التضامن</strong> بأداء الوجيبة الكرائية والتكاليف.</p>
<h3 style="text-align:right;"><strong>المادة 1 — الموضوع والغرض</strong></h3>
<p style="text-align:right;">يكري المكري للمكتري الذي يقبل، المحل المبين في المادة 2، <strong>للسكنى الرئيسية حصرا</strong> للمكتري وأسرته. ويمنع فيه كل نشاط تجاري أو مهني أو كراء سياحي قصير المدة دون الموافقة الكتابية للمكري.</p>
<h3 style="text-align:right;"><strong>المادة 2 — تعيين المحل</strong></h3>
<p style="text-align:right;">العنوان: {{property_address}}، المدينة {{property_city}}</p>
<p style="text-align:right;">النوع: ☐ شقة ☐ فيلا ☐ منزل ☐ استوديو — الطابق {{property_floor}}، المساحة {{property_surface_nombre}} م²، يتكون من: {{property_consistance}}</p>
<p style="text-align:right;">المرافق: ☐ مرأب ☐ قبو ☐ سطح ☐ حديقة ☐ أخرى: ……………</p>
<p style="text-align:right;">التجهيزات: ☐ مطبخ مجهز ☐ سخان الماء ☐ مكيف ☐ مصعد ☐ جهاز النداء الداخلي ☐ هوائي / ألياف بصرية</p>
<p style="text-align:right;">الرسم العقاري عدد …………… (إن كان محفظا).</p>
<p style="text-align:right;">يكرى المحل: ☐ <strong>فارغا</strong> ☐ <strong>مفروشا</strong>، والأثاث مبين في <strong>الملحق 2 (الجرد)</strong> الذي يعد جزءا لا يتجزأ من العقد.</p>
<h3 style="text-align:right;"><strong>المادة 3 — المدة</strong></h3>
<p style="text-align:right;">أبرم عقد الكراء لمدة ……… (……) ☐ سنة ☐ شهر، تبتدئ من …………… وتنتهي في …………… ثم يتجدد <strong>ضمنيا</strong> لمدد متتالية مماثلة، ما لم يوجه إشعار بالإفراغ وفق الشروط المنصوص عليها في المادة 13.</p>
<h3 style="text-align:right;"><strong>المادة 4 — الوجيبة الكرائية</strong></h3>
<p style="text-align:right;">حددت الوجيبة الكرائية الشهرية باتفاق الطرفين في <strong>{{property_rent_nombre}} درهم</strong> (……………………… درهم)، تؤدى <strong>مسبقا</strong>، في أجل أقصاه اليوم ……… من كل شهر، بواسطة ☐ تحويل إلى الحساب البنكي ……………………… ☐ شيك ☐ غير ذلك: ……………</p>
<p style="text-align:right;">يسلم المكري أو وكيله <strong>وصلا</strong> عن كل أداء. وإذا قُبل الأداء نقدا، وجب تسليم وصل عنه.</p>
<h3 style="text-align:right;"><strong>المادة 5 — التكاليف والرسوم</strong></h3>
<p style="text-align:right;">يتحمل <strong>المكتري</strong>: استهلاك الماء والكهرباء والغاز والهاتف والإنترنت، ويبرم الاشتراكات باسمه؛ ☐ تكاليف الملكية المشتركة القابلة للاسترجاع، بصفة جزافية قدرها {{property_condo_fees_nombre}} درهم في الشهر ☐ بناء على المستندات.</p>
<p style="text-align:right;">يتحمل <strong>المكري</strong>: الضريبة على الدخول العقارية، والإصلاحات الكبرى، وتكاليف الملكية المشتركة غير القابلة للاسترجاع.</p>
<p style="text-align:right;">يتوزع الرسم على الخدمات الجماعية، وعند الاقتضاء الرسم على السكن، كما يلي: ☐ المكري ☐ المكتري ☐ غير ذلك: ……………</p>
<h3 style="text-align:right;"><strong>المادة 6 — الضمانة</strong></h3>
<p style="text-align:right;">يؤدي المكتري في هذا اليوم ضمانة قدرها <strong>……………… درهم</strong>، تعادل ……… شهر من الكراء، <strong>في حدود السقف القانوني المحدد في كراء شهرين</strong> (القانون رقم 67.12). ولا تنتج هذه الضمانة أي فائدة، ولا يجوز للمكتري بأي حال خصمها من الوجيبة الكرائية الأخيرة.</p>
<p style="text-align:right;">تُرد إلى المكتري داخل أجل ……… يوما من تاريخ تسليم المفاتيح، بعد خصم المبالغ المستحقة للمكري (الكراء، التكاليف، الإصلاحات الكرائية) المثبتة بمقارنة بياني حالة المحل عند الدخول والخروج.</p>
<h3 style="text-align:right;"><strong>المادة 7 — مراجعة الوجيبة الكرائية</strong></h3>
<p style="text-align:right;">يتفق الطرفان على إمكانية مراجعة الوجيبة الكرائية ☐ كل ثلاث سنوات ☐ غير ذلك: ……………، بنسبة ……… % (مراجعة اتفاقية). وفي غياب الاتفاق، تخضع المراجعة للقانون رقم 67.12: فلا تتم إلا بعد انصرام أجل <strong>ثلاث سنوات</strong>، ولا يجوز أن تتجاوز الزيادة <strong>8 %</strong> بالنسبة للمحل المعد للسكنى، مع مراعاة سلطة المحكمة المنصوص عليها في القانون.</p>
<h3 style="text-align:right;"><strong>المادة 8 — التزامات المكري</strong></h3>
<p style="text-align:right;">يلتزم المكري بما يلي:</p>
<p style="text-align:right;">– تسليم المحل في حالة صالحة للسكنى، مع تجهيزاته في حالة اشتغال؛</p>
<p style="text-align:right;">– ضمان الانتفاع الهادئ للمكتري بالمحل، وضمان العيوب التي تحول دون استعماله؛</p>
<p style="text-align:right;">– القيام بـ<strong>الإصلاحات الكبرى</strong> والإصلاحات الضرورية للإبقاء على المحل صالحا للاستعمال؛</p>
<p style="text-align:right;">– تسليم وصل عن كل أداء؛</p>
<p style="text-align:right;">– عدم تغيير شكل المحل أو الغرض المعد له خلال مدة الكراء.</p>
<h3 style="text-align:right;"><strong>المادة 9 — التزامات المكتري</strong></h3>
<p style="text-align:right;">يلتزم المكتري بما يلي:</p>
<p style="text-align:right;">– أداء الوجيبة الكرائية والتكاليف في آجالها المتفق عليها؛</p>
<p style="text-align:right;">– استعمال المحل استعمال الشخص الحريص، وفقا للغرض المعد له ولنظام الملكية المشتركة؛</p>
<p style="text-align:right;">– تحمل <strong>الإصلاحات الكرائية</strong> والصيانة العادية؛</p>
<p style="text-align:right;">– عدم القيام بأي تغيير دون الموافقة الكتابية للمكري؛</p>
<p style="text-align:right;">– الإخبار فورا بكل ضرر أو إتلاف؛</p>
<p style="text-align:right;">– السماح بالولوج إلى المحل للقيام بالإصلاحات المستعجلة، وفي نهاية الكراء، للمعاينة من طرف الراغبين؛</p>
<p style="text-align:right;">– ☐ إبرام تأمين متعدد المخاطر للسكن والإدلاء به عند أول طلب؛</p>
<p style="text-align:right;">– إرجاع المحل بالحالة الموصوفة في بيان حالة الدخول، باستثناء الاستعمال العادي.</p>
<h3 style="text-align:right;"><strong>المادة 10 — الكراء من الباطن والتولية</strong></h3>
<p style="text-align:right;"><strong>يمنع</strong> كل كراء من الباطن، كلي أو جزئي، وكل تولية للكراء، دون الموافقة الصريحة والكتابية للمكري.</p>
<h3 style="text-align:right;"><strong>المادة 11 — بيان حالة المحل والجرد</strong></h3>
<p style="text-align:right;">يُحرَّر <strong>بيان حضوري لحالة المحل</strong> ويوقعه الطرفان عند تسليم المفاتيح (الملحق 1)، ثم عند إرجاعها. وفي الكراء المفروش، يتم التحقق من <strong>الجرد</strong> (الملحق 2) في نفس التاريخين. وفي غياب بيان حالة الدخول، يفترض أن المحل سُلِّم في حالة جيدة ما لم يثبت العكس.</p>
<h3 style="text-align:right;"><strong>المادة 12 — عدم الأداء</strong></h3>
<p style="text-align:right;">في حالة عدم أداء الوجيبة الكرائية في أجلها، يجوز للمكري أن يوجه إلى المكتري <strong>إنذارا</strong> بالأداء وفق الشكليات والآجال المنصوص عليها في القانون رقم 67.12. وإذا لم يتم الأداء داخل الأجل القانوني، جاز له اللجوء إلى المحكمة المختصة من أجل الاستخلاص وفسخ العقد والإفراغ، وفق المسطرة المنصوص عليها في هذا القانون.</p>
<h3 style="text-align:right;"><strong>المادة 13 — الإشعار بالإفراغ وانتهاء الكراء</strong></h3>
<p style="text-align:right;"><strong>من طرف المكتري</strong>: يجوز له إنهاء الكراء في أي وقت، مقابل إشعار مدته ……… شهر، يبلغ برسالة مضمونة مع إشعار بالتوصل أو بواسطة مفوض قضائي.</p>
<p style="text-align:right;"><strong>من طرف المكري</strong>: لا يجوز له إنهاء الكراء إلا لأحد <strong>الأسباب المنصوص عليها في القانون رقم 67.12</strong> (ولا سيما الاسترجاع من أجل سكناه أو سكنى أقاربه، أو الهدم وإعادة البناء، أو الأشغال التي تستوجب الإفراغ، أو إخلال جسيم من المكتري)، بإشعار معلل يبلغ وفق الشكليات والآجال القانونية، مع مراعاة التعويضات المنصوص عليها في القانون.</p>
<p style="text-align:right;">عند الخروج، يدلي المكتري بما يثبت أداء آخر فواتير الماء والكهرباء.</p>
<h3 style="text-align:right;"><strong>المادة 14 — التاريخ الثابت والمصاريف والنزاعات</strong></h3>
<p style="text-align:right;">استيفاء للمادة 3 من القانون رقم 67.12، يكتسب هذا العقد <strong>تاريخا ثابتا</strong> بواسطة ☐ تصحيح إمضاءات الطرفين ☐ تسجيله. ويتحمل المصاريف المترتبة عن ذلك ☐ الطرفان مناصفة ☐ ……………</p>
<p style="text-align:right;">☐ تقع أتعاب الوكالة عن الكراء، أي {{commission_amount_nombre}} درهم شاملة للضرائب، على عاتق ……………</p>
<p style="text-align:right;">تعالج المعطيات الشخصية للمكتري لغرض تسيير الكراء فقط (القانون رقم 09.08). ويختار المكتري موطنه في المحل المكترى والمكري في العنوان المذكور أعلاه. وحرر العقد ☐ باللغة العربية فقط ☐ في نسختين، عربية وفرنسية، توقعان معا؛ وفي هذه الحالة، عند الاختلاف، يعتد بالنص ☐ العربي ☐ الفرنسي. ويختص بالنظر في كل نزاع المحكمة الابتدائية لموقع المحل.</p>
<p style="text-align:right;">حرر بـ {{agency_city}}، بتاريخ {{date}}، في ……… نظائر أصلية، يتسلم كل طرف نظيرا منها. الملاحق: 1. بيان حالة المحل — 2. ☐ جرد الأثاث — 3. نسخ من وثائق الهوية.</p>
<table><tbody><tr><td style="text-align:right;"><strong>المكري (أو وكيله)</strong><br>«قرئ وصودق عليه»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>المكتري</strong><br>«قرئ وصودق عليه»<br>توقيع مصادق عليه</td></tr></tbody></table>
<h2 style="text-align:center;"><strong>الملحق 1 — بيان حالة المحل عند الدخول والخروج</strong></h2>
<p style="text-align:center;">يُحرَّر حضوريا — التقييم: ج = جديد · ح = حسن · م = مستعمل · س = سيئ</p>
<p style="text-align:right;">عنوان المحل: {{property_address}}</p>
<p style="text-align:right;">بيان حالة <strong>الدخول</strong> بتاريخ …………… — قراءة العدادات: الماء ………… / الكهرباء ………… — عدد المفاتيح المسلمة: ……</p>
<p style="text-align:right;">بيان حالة <strong>الخروج</strong> بتاريخ …………… — قراءة العدادات: الماء ………… / الكهرباء ………… — عدد المفاتيح المرجعة: ……</p>
<p style="text-align:right;">العناصر الواجب معاينتها في كل غرفة: الأرضيات، الجدران، الأسقف، الأبواب، النوافذ، الكهرباء، السباكة، التجهيزات.</p>
<table><thead><tr><th style="text-align:right;"><strong>الغرفة</strong></th><th style="text-align:right;"><strong>الحالة عند الدخول</strong></th><th style="text-align:right;"><strong>الحالة عند الخروج</strong></th><th style="text-align:right;"><strong>ملاحظات</strong></th></tr></thead><tbody><tr><td style="text-align:right;">المدخل / الممر</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة الجلوس / الصالون</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">المطبخ</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة النوم 1</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة النوم 2</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة النوم 3</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">الحمام / الدوش</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">المرحاض</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">الشرفة / السطح</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة الغسيل / القبو / المرأب</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr></tbody></table>
<p style="text-align:right;">صور مؤرخة مرفقة: ☐ نعم (العدد: ……) ☐ لا. تحفظات خاصة: ……………………………………………………………………</p>
<table><tbody><tr><td style="text-align:right;"><strong>المكري — الدخول</strong><br> </td><td style="text-align:right;"><strong>المكتري — الدخول</strong><br> </td><td style="text-align:right;"><strong>المكري — الخروج</strong><br> </td><td style="text-align:right;"><strong>المكتري — الخروج</strong><br> </td></tr></tbody></table>
<h2 style="text-align:center;"><strong>الملحق 2 — جرد الأثاث (الكراء المفروش)</strong></h2>
<p style="text-align:center;">يملأ فقط إذا كان المحل مكرى مفروشا</p>
<table><thead><tr><th style="text-align:right;"><strong>الغرفة</strong></th><th style="text-align:right;"><strong>تعيين الأثاث / التجهيز</strong></th><th style="text-align:right;"><strong>العدد</strong></th><th style="text-align:right;"><strong>الحالة عند الدخول</strong></th><th style="text-align:right;"><strong>الحالة عند الخروج</strong></th></tr></thead><tbody><tr><td style="text-align:right;">الصالون</td><td style="text-align:right;">أريكة / صالون مغربي، طاولة، كراسي، تلفاز، ستائر</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">المطبخ</td><td style="text-align:right;">ثلاجة، موقد / صفائح طهي، فرن، فرن ميكروويف، أواني، أدوات المطبخ</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة النوم 1</td><td style="text-align:right;">سرير، فراش، خزانة، طاولة جانبية، ستائر</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">غرفة النوم 2</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">الحمام</td><td style="text-align:right;">آلة غسيل، مرآة، لوازم</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;">أخرى</td><td style="text-align:right;">مكيفات (العدد: ……)، أفرشة وأغطية، مصابيح</td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr><tr><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td><td style="text-align:right;"></td></tr></tbody></table>
<p style="text-align:right;">يقر المكتري بتسلم الأثاث والتجهيزات المذكورة أعلاه بالحالة المبينة، ويلتزم بإرجاعها بنفس الحالة، باستثناء الاستعمال العادي. ويستبدل كل عنصر مفقود أو متلف أو يعوض بقيمة استبداله.</p>
<table><tbody><tr><td style="text-align:right;"><strong>المكري</strong><br> </td><td style="text-align:right;"><strong>المكتري</strong><br> </td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'mandate_rental', $nom$Mandat de location et de gestion locative$nom$, 'fr', $html$
<h1 style="text-align:center;"><strong>MANDAT DE LOCATION ET DE GESTION LOCATIVE</strong></h1>
<p style="text-align:center;"><em><em>Articles 879 et suivants du DOC (mandat) — loi n° 67-12 (baux d'habitation) — loi n° 43-05 (LBC/FT) — loi n° 09-08 (données personnelles)</em></em></p>
<blockquote><strong>Portée.</strong> Ce mandat porte sur des actes d'administration (louer, encaisser, entretenir). Il <strong>ne confère aucun pouvoir de vendre, d'hypothéquer ni de consentir un droit réel</strong>. Un tel pouvoir exigerait, depuis la loi n° 41-25, une procuration en la forme authentique (article 4 du Code des droits réels). Faire légaliser les signatures. Sélectionner la mission voulue à l'article 2 (location seule, ou location et gestion).</blockquote>
<h3><strong>ENTRE LES SOUSSIGNÉS</strong></h3>
<p style="text-align:justify;"><strong>1. LE MANDANT</strong> (propriétaire) : M./Mme / Société {{nom_mandants}}, CNIE / RC n° ……………, demeurant / siège à ……………………………, tél. {{client_phone}}, e-mail {{client_email}}, RIB pour les reversements : ………………………………, ci-après « le Mandant ».</p>
<p style="text-align:justify;"><strong>2. LE MANDATAIRE</strong> (agence) : société {{agency_name}}, forme ……………, capital ………… MAD, siège {{agency_address}}, RC n° {{agency_rc}} (……………), ICE {{agency_ice}}, IF ……………, patente ……………, assurée en responsabilité civile professionnelle auprès de …………… (police n° ……………), représentée par {{agent_name}}, ci-après « le Mandataire ».</p>
<h3><strong>ARTICLE 1 — BIEN CONCERNÉ</strong></h3>
<p style="text-align:justify;">Bien : ☐ appartement ☐ villa ☐ maison ☐ local — adresse {{property_address}}, superficie {{property_surface_nombre}} m², titre foncier n° ……………, ☐ vide ☐ meublé.</p>
<p style="text-align:justify;">Le Mandant déclare être propriétaire du bien, avoir la capacité de le donner à bail et que le bien est libre de toute occupation, sauf : ……………………</p>
<h3><strong>ARTICLE 2 — ÉTENDUE DE LA MISSION</strong></h3>
<p style="text-align:justify;">Le Mandant donne au Mandataire, qui accepte, mandat de (cocher) :</p>
<p style="text-align:justify;">☐ <strong>A. Mise en location</strong> : rechercher un locataire au loyer mensuel de {{property_rent_nombre}} MAD minimum ; diffuser des annonces sur tout support (vitrine, sites, réseaux sociaux) ; organiser les visites ; vérifier la solvabilité et l'identité des candidats ; rédiger et signer au nom du Mandant le bail conforme à la loi n° 67-12 ; établir l'état des lieux et l'inventaire ; encaisser le premier loyer et le dépôt de garantie.</p>
<p style="text-align:justify;">☐ <strong>B. Gestion locative</strong> (en plus de A, ou pour un bail existant) : encaisser loyers, charges et dépôt de garantie et en donner quittance ; relancer le locataire et lui adresser les mises en demeure prévues par la loi n° 67-12 ; ☐ mandater un avocat pour les procédures, sur accord préalable du Mandant ; mettre en œuvre la révision du loyer ; faire exécuter les réparations courantes jusqu'à ……………… MAD par intervention sans accord préalable, et au-delà sur devis accepté par le Mandant (sauf urgence) ; recevoir et donner congé ; établir l'état des lieux de sortie et restituer le dépôt de garantie ; représenter le Mandant aux assemblées de copropriété ☐ oui ☐ non.</p>
<h3><strong>ARTICLE 3 — OBLIGATIONS DU MANDATAIRE</strong></h3>
<p style="text-align:justify;">Le Mandataire exécute sa mission avec la diligence d'un professionnel et dans le seul intérêt du Mandant. Il s'oblige notamment à :</p>
<p style="text-align:justify;">– conserver les fonds encaissés pour le compte du Mandant sur un <strong>compte bancaire distinct</strong> de ses fonds propres et les reverser au plus tard le ……… de chaque mois ;</p>
<p style="text-align:justify;">– adresser au Mandant un <strong>compte rendu de gestion</strong> ☐ mensuel ☐ trimestriel (loyers encaissés, impayés, dépenses avec justificatifs, honoraires) ;</p>
<p style="text-align:justify;">– informer sans délai le Mandant de tout impayé, sinistre ou litige ;</p>
<p style="text-align:justify;">– remettre chaque année au Mandant le relevé des revenus perçus, utile à sa déclaration des revenus fonciers ;</p>
<p style="text-align:justify;">– rendre compte de sa gestion à la fin du mandat et restituer pièces, clés et fonds.</p>
<h3><strong>ARTICLE 4 — OBLIGATIONS DU MANDANT</strong></h3>
<p style="text-align:justify;">Le Mandant s'oblige à : remettre au Mandataire les pièces utiles (titre de propriété ou certificat de propriété, règlement de copropriété, factures, clés) ; garantir le Mandataire contre toute réclamation relative à la propriété du bien ; maintenir le bien assuré ; financer les grosses réparations ; ne pas louer le bien directement pendant le mandat sans en informer le Mandataire.</p>
<h3><strong>ARTICLE 5 — RÉMUNÉRATION</strong></h3>
<p style="text-align:justify;">– <strong>Honoraires de mise en location</strong> : ……… mois de loyer hors charges, soit {{commission_amount_nombre}} MAD TTC, dus à la signature du bail, ☐ à la charge du Mandant ☐ partagés avec le locataire dans la proportion ……… ;</p>
<p style="text-align:justify;">– <strong>Honoraires de gestion</strong> : {{commission_rate_nombre}} % TTC des sommes effectivement encaissées, prélevés sur chaque encaissement ;</p>
<p style="text-align:justify;">– <strong>Prestations particulières</strong> (suivi de contentieux, suivi de gros travaux, état des lieux supplémentaire) : selon barème annexé.</p>
<p style="text-align:justify;">Aucune autre rémunération ne peut être perçue par le Mandataire au titre de sa mission.</p>
<h3><strong>ARTICLE 6 — DURÉE ET RÉSILIATION</strong></h3>
<p style="text-align:justify;">Le mandat est conclu pour une durée de ……… mois à compter du {{date}}, renouvelable par <strong>tacite reconduction</strong> par périodes de ……… mois.</p>
<p style="text-align:justify;">Chaque partie peut y mettre fin moyennant un préavis de ……… mois, notifié par lettre recommandée avec accusé de réception, sans préjudice des honoraires acquis. Le mandat prend fin, en outre, dans les cas prévus aux articles 929 et suivants du DOC (notamment décès, incapacité, faillite).</p>
<p style="text-align:justify;">À la fin du mandat, le Mandataire informe le locataire du changement d'interlocuteur et remet au Mandant le dossier complet.</p>
<h3><strong>ARTICLE 7 — RESPONSABILITÉ</strong></h3>
<p style="text-align:justify;">Le Mandataire répond de ses fautes de gestion dans les conditions des articles 903 et suivants du DOC. Il ne garantit pas la solvabilité du locataire, sauf ☐ souscription, à la demande du Mandant, d'une garantie de loyers impayés auprès de …………… au coût de ……… % des loyers.</p>
<h3><strong>ARTICLE 8 — DISPOSITIONS GÉNÉRALES</strong></h3>
<p style="text-align:justify;"><strong>LBC/FT</strong> : le Mandataire, assujetti à la loi n° 43-05 telle que modifiée, procède à l'identification du Mandant et des locataires et peut refuser toute opération suspecte. <strong>Données personnelles</strong> : les données sont traitées aux seules fins du mandat, conformément à la loi n° 09-08. <strong>Consommation</strong> : si le Mandant est un consommateur et que le mandat est conclu hors établissement, il bénéficie du droit de rétractation prévu par la loi n° 31-08.</p>
<p style="text-align:justify;">Le mandat est établi ☐ en langue française uniquement ☐ en deux versions, française et arabe, signées ensemble ; dans ce cas, en cas de divergence, la version ☐ arabe ☐ française prévaut. Tout litige relève des tribunaux de ……………</p>
<p style="text-align:justify;">Fait à {{agency_city}}, le {{date}}, en deux exemplaires originaux.</p>
<table><tbody><tr><td><strong>Le Mandant</strong><br><em>« Bon pour mandat »</em><br>Signature légalisée</td><td><strong>Le Mandataire</strong><br><em>« Mandat accepté »</em><br>Signature légalisée</td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'mandate_rental', $nom$وكالة الكراء والتسيير الكرائي$nom$, 'ar', $html$
<h1 style="text-align:center;"><strong>وكالة الكراء والتسيير الكرائي</strong></h1>
<p style="text-align:center;"><em>الفصول 879 وما يليها من ظهير الالتزامات والعقود (الوكالة) — القانون رقم 67.12 (كراء السكنى) — القانون رقم 43.05 (مكافحة غسل الأموال) — القانون رقم 09.08 (المعطيات الشخصية)</em></p>
<blockquote style="text-align:right;"><strong>النطاق.</strong> تتعلق هذه الوكالة بأعمال الإدارة (الكراء والاستخلاص والصيانة)، و<strong>لا تخول أي سلطة للبيع أو الرهن أو إنشاء حق عيني</strong>. فمثل هذه السلطة تستلزم، منذ القانون رقم 41.25، وكالة في شكل رسمي (المادة 4 من مدونة الحقوق العينية). تُصحَّح الإمضاءات. ويُختار نطاق المهمة في المادة 2 (الكراء فقط، أو الكراء والتسيير).</blockquote>
<h3 style="text-align:right;"><strong>بين الموقعين أسفله</strong></h3>
<p style="text-align:right;"><strong>1. الموكل</strong> (المالك): السيد(ة) / الشركة {{nom_mandants}}، البطاقة الوطنية / السجل التجاري رقم ……………، الساكن(ة) / مقرها بـ ……………………………، الهاتف {{client_phone}}، البريد الإلكتروني {{client_email}}، الحساب البنكي لتحويل المبالغ: ………………………………، يشار إليه فيما يلي بـ «الموكل».</p>
<p style="text-align:right;"><strong>2. الوكيل</strong> (الوكالة): شركة {{agency_name}}، شكلها ……………، رأسمالها ………… درهم، مقرها {{agency_address}}، سجل تجاري رقم {{agency_rc}} (……………)، التعريف الموحد {{agency_ice}}، التعريف الضريبي ……………، الضريبة المهنية ……………، مؤمنة عن المسؤولية المدنية المهنية لدى …………… (عقد رقم ……………)، يمثلها {{agent_name}}، يشار إليها فيما يلي بـ «الوكيل».</p>
<h3 style="text-align:right;"><strong>المادة 1 — العقار المعني</strong></h3>
<p style="text-align:right;">العقار: ☐ شقة ☐ فيلا ☐ منزل ☐ محل — العنوان {{property_address}}، المساحة {{property_surface_nombre}} م²، الرسم العقاري عدد ……………، ☐ فارغ ☐ مفروش.</p>
<p style="text-align:right;">يصرح الموكل بأنه مالك العقار، وبأنه أهل لكرائه، وبأن العقار خال من كل شغل، باستثناء: ……………………</p>
<h3 style="text-align:right;"><strong>المادة 2 — نطاق المهمة</strong></h3>
<p style="text-align:right;">يمنح الموكل للوكيل الذي يقبل، وكالة من أجل (يؤشر على المطلوب):</p>
<p style="text-align:right;">☐ <strong>أ. الكراء</strong>: البحث عن مكتر بوجيبة شهرية لا تقل عن {{property_rent_nombre}} درهم؛ نشر الإعلانات على كل الوسائط (الواجهة، المواقع، شبكات التواصل)؛ تنظيم المعاينات؛ التحقق من ملاءة المرشحين وهويتهم؛ تحرير عقد الكراء وتوقيعه باسم الموكل وفقا للقانون رقم 67.12؛ تحرير بيان حالة المحل والجرد؛ استخلاص الوجيبة الأولى والضمانة.</p>
<p style="text-align:right;">☐ <strong>ب. التسيير الكرائي</strong> (إضافة إلى أ، أو بالنسبة لكراء قائم): استخلاص الوجيبات والتكاليف والضمانة وتسليم الوصولات؛ مطالبة المكتري وتوجيه الإنذارات المنصوص عليها في القانون رقم 67.12؛ ☐ تكليف محام بالمساطر، بعد الموافقة المسبقة للموكل؛ تطبيق مراجعة الوجيبة؛ القيام بالإصلاحات العادية في حدود ……………… درهم لكل تدخل دون موافقة مسبقة، وما يتجاوز ذلك بناء على بيان أثمان يقبله الموكل (باستثناء الحالات المستعجلة)؛ تلقي الإشعار بالإفراغ وتوجيهه؛ تحرير بيان حالة الخروج ورد الضمانة؛ تمثيل الموكل في جموع الملكية المشتركة ☐ نعم ☐ لا.</p>
<h3 style="text-align:right;"><strong>المادة 3 — التزامات الوكيل</strong></h3>
<p style="text-align:right;">ينفذ الوكيل مهمته بعناية المهني ولمصلحة الموكل وحده. ويلتزم على الخصوص بما يلي:</p>
<p style="text-align:right;">– الاحتفاظ بالأموال المستخلصة لحساب الموكل في <strong>حساب بنكي مستقل</strong> عن أمواله الخاصة، وتحويلها في أجل أقصاه اليوم ……… من كل شهر؛</p>
<p style="text-align:right;">– توجيه <strong>تقرير عن التسيير</strong> إلى الموكل ☐ شهريا ☐ كل ثلاثة أشهر (الوجيبات المستخلصة، المتأخرات، المصاريف مع المستندات، الأتعاب)؛</p>
<p style="text-align:right;">– إخبار الموكل فورا بكل تأخر في الأداء أو ضرر أو نزاع؛</p>
<p style="text-align:right;">– تسليم الموكل كل سنة بيانا بالمداخيل المحصلة، يفيده في التصريح بالدخول العقارية؛</p>
<p style="text-align:right;">– تقديم حساب عن تسييره عند انتهاء الوكالة وإرجاع الوثائق والمفاتيح والأموال.</p>
<h3 style="text-align:right;"><strong>المادة 4 — التزامات الموكل</strong></h3>
<p style="text-align:right;">يلتزم الموكل بما يلي: تسليم الوكيل الوثائق اللازمة (سند الملكية أو شهادة الملكية، نظام الملكية المشتركة، الفواتير، المفاتيح)؛ ضمان الوكيل ضد كل مطالبة تتعلق بملكية العقار؛ الإبقاء على تأمين العقار؛ تمويل الإصلاحات الكبرى؛ عدم كراء العقار مباشرة خلال مدة الوكالة دون إخبار الوكيل.</p>
<h3 style="text-align:right;"><strong>المادة 5 — الأجرة</strong></h3>
<p style="text-align:right;">– <strong>أتعاب الكراء</strong>: ……… شهر من الوجيبة دون التكاليف، أي {{commission_amount_nombre}} درهم شاملة للضرائب، تستحق عند توقيع عقد الكراء، ☐ على عاتق الموكل ☐ موزعة مع المكتري بنسبة ………؛</p>
<p style="text-align:right;">– <strong>أتعاب التسيير</strong>: {{commission_rate_nombre}} % شاملة للضرائب من المبالغ المستخلصة فعلا، تقتطع من كل استخلاص؛</p>
<p style="text-align:right;">– <strong>الخدمات الخاصة</strong> (تتبع النزاعات، تتبع الأشغال الكبرى، بيان حالة إضافي): حسب جدول الأثمان المرفق.</p>
<p style="text-align:right;">لا يجوز للوكيل تقاضي أي أجرة أخرى عن مهمته.</p>
<h3 style="text-align:right;"><strong>المادة 6 — المدة والإنهاء</strong></h3>
<p style="text-align:right;">أبرمت الوكالة لمدة ……… شهر ابتداء من {{date}}، قابلة للتجديد <strong>الضمني</strong> لمدد مدتها ……… شهر.</p>
<p style="text-align:right;">يجوز لكل طرف إنهاؤها مقابل إشعار مدته ……… شهر، يبلغ برسالة مضمونة مع إشعار بالتوصل، دون المساس بالأتعاب المكتسبة. وتنتهي الوكالة كذلك في الحالات المنصوص عليها في الفصول 929 وما يليها من ظهير الالتزامات والعقود (ولا سيما الوفاة، أو فقدان الأهلية، أو الإفلاس).</p>
<p style="text-align:right;">عند انتهاء الوكالة، يخبر الوكيل المكتري بتغيير المخاطَب ويسلم للموكل الملف كاملا.</p>
<h3 style="text-align:right;"><strong>المادة 7 — المسؤولية</strong></h3>
<p style="text-align:right;">يسأل الوكيل عن أخطاء التسيير وفق الشروط المنصوص عليها في الفصول 903 وما يليها من ظهير الالتزامات والعقود. ولا يضمن ملاءة المكتري، إلا ☐ في حالة الاكتتاب، بطلب من الموكل، في ضمانة ضد عدم أداء الكراء لدى …………… بكلفة ……… % من الوجيبات.</p>
<h3 style="text-align:right;"><strong>المادة 8 — مقتضيات عامة</strong></h3>
<p style="text-align:right;"><strong>مكافحة غسل الأموال</strong>: يقوم الوكيل، الخاضع للقانون رقم 43.05 كما تم تغييره، بالتحقق من هوية الموكل والمكترين، ويجوز له رفض كل عملية مشبوهة. <strong>المعطيات الشخصية</strong>: تعالج المعطيات لغرض الوكالة فقط، طبقا للقانون رقم 09.08. <strong>حماية المستهلك</strong>: إذا كان الموكل مستهلكا وأبرمت الوكالة خارج المحل التجاري، استفاد من حق التراجع المنصوص عليه في القانون رقم 31.08.</p>
<p style="text-align:right;">حررت الوكالة ☐ باللغة العربية فقط ☐ في نسختين، عربية وفرنسية، توقعان معا؛ وفي هذه الحالة، عند الاختلاف، يعتد بالنص ☐ العربي ☐ الفرنسي. ويختص بالنظر في كل نزاع محاكم ……………</p>
<p style="text-align:right;">حرر بـ {{agency_city}}، بتاريخ {{date}}، في نظيرين أصليين.</p>
<table><tbody><tr><td style="text-align:right;"><strong>الموكل</strong><br>«صالح للوكالة»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>الوكيل</strong><br>«قبلت الوكالة»<br>توقيع مصادق عليه</td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'mandate_sale', $nom$Mandat de vente — simple ou exclusif$nom$, 'fr', $html$
<h1 style="text-align:center;"><strong>MANDAT DE VENTE — ☐ SIMPLE ☐ EXCLUSIF</strong></h1>
<p style="text-align:center;"><em><em>Mandat d'entremise — articles 879 et suivants du DOC — article 264 du DOC (clause pénale) — loi n° 43-05 (LBC/FT) — loi n° 09-08</em></em></p>
<blockquote><strong>Nature du mandat.</strong> Il s'agit d'un <strong>mandat d'entremise</strong> : l'agence recherche un acquéreur et négocie, mais <strong>ne peut ni signer la promesse ni signer la vente</strong> au nom du propriétaire. Depuis la loi n° 41-25, la promesse de vente et le mandat qui s'y rapporte doivent être dressés par acte authentique (article 4 du Code des droits réels) ; le présent mandat, signé sous seing privé avec signatures légalisées, n'en tient pas lieu.<br>Cocher <strong>SIMPLE</strong> ou <strong>EXCLUSIF</strong> dans le titre et à l'article 3 ; les clauses marquées [EXCLUSIF] ne s'appliquent qu'au mandat exclusif.</blockquote>
<h3><strong>ENTRE LES SOUSSIGNÉS</strong></h3>
<p style="text-align:justify;"><strong>1. LE MANDANT</strong> (propriétaire) : M./Mme / Société {{nom_mandants}}, CNIE / RC n° ……………, demeurant / siège à ……………………………, tél. {{client_phone}}, e-mail {{client_email}}, état civil et régime matrimonial : ……………, ci-après « le Mandant ». En cas de pluralité de propriétaires (indivision), tous signent le présent mandat.</p>
<p style="text-align:justify;"><strong>2. LE MANDATAIRE</strong> (agence) : société {{agency_name}}, RC n° {{agency_rc}} (……………), ICE {{agency_ice}}, IF ……………, siège {{agency_address}}, assurée en responsabilité civile professionnelle auprès de …………… (police n° ……………), représentée par {{agent_name}}, ci-après « le Mandataire ».</p>
<h3><strong>ARTICLE 1 — BIEN À VENDRE</strong></h3>
<p style="text-align:justify;">Nature : ☐ appartement ☐ villa ☐ maison ☐ terrain ☐ local — adresse {{property_address}}, superficie {{property_surface_nombre}} m², composé de : {{property_consistance}}</p>
<p style="text-align:justify;">Titre foncier n° ……………, Conservation foncière de …………… ☐ Bien non immatriculé (melkia / acte adoulaire n° ……………)</p>
<p style="text-align:justify;">☐ Copropriété : lot n° ………, syndic ……………………</p>
<p style="text-align:justify;">Situation locative : ☐ libre ☐ loué (loyer ……… MAD, bail du ……………)</p>
<p style="text-align:justify;">Charges connues : ☐ aucune ☐ hypothèque au profit de …………… ☐ autre : ……………</p>
<h3><strong>ARTICLE 2 — PRIX DE VENTE</strong></h3>
<p style="text-align:justify;">Le bien est proposé au prix de <strong>{{asking_price_nombre}} MAD</strong> (……………………… dirhams), ☐ rémunération du Mandataire incluse ☐ rémunération en sus à la charge de l'acquéreur. Le Mandant pourra accepter toute offre égale ou supérieure à ……………… MAD. Toute modification du prix est convenue par écrit (avenant, courriel ou message confirmé).</p>
<h3><strong>ARTICLE 3 — NATURE DU MANDAT</strong></h3>
<p style="text-align:justify;">☐ <strong>MANDAT SIMPLE</strong> : le Mandant conserve le droit de vendre lui-même ou par l'intermédiaire d'autres agences. Il s'oblige à informer sans délai le Mandataire de la vente conclue, en lui indiquant l'identité de l'acquéreur, afin d'éviter tout double paiement de rémunération.</p>
<p style="text-align:justify;">☐ <strong>MANDAT EXCLUSIF</strong> : pendant la durée de l'exclusivité, le Mandant s'interdit de vendre le bien directement ou par un autre intermédiaire. Il transmet au Mandataire toute demande reçue directement, pour qu'il la traite.</p>
<h3><strong>ARTICLE 4 — DURÉE</strong></h3>
<p style="text-align:justify;">Le mandat est consenti pour une durée de ……… mois à compter de sa signature.</p>
<p style="text-align:justify;">– <strong>[EXCLUSIF]</strong> Pendant une période initiale <strong>irrévocable</strong> de ……… mois (en pratique 3 mois), le mandat ne peut être résilié, sauf faute grave du Mandataire. À l'issue, il se poursuit pour ……… mois, chaque partie pouvant y mettre fin à tout moment avec un préavis de 15 jours par lettre recommandée.</p>
<p style="text-align:justify;">– <strong>[SIMPLE]</strong> Chaque partie peut y mettre fin à tout moment avec un préavis de 15 jours par lettre recommandée.</p>
<p style="text-align:justify;">Le mandat prend fin de plein droit à la signature de l'acte de vente définitif, ou dans les cas prévus aux articles 929 et suivants du DOC.</p>
<h3><strong>ARTICLE 5 — MISSION ET OBLIGATIONS DU MANDATAIRE</strong></h3>
<p style="text-align:justify;">Le Mandataire s'oblige à :</p>
<p style="text-align:justify;">– estimer le bien et conseiller le Mandant sur le prix de marché ;</p>
<p style="text-align:justify;">– diffuser des annonces sur tout support, avec photos et, le cas échéant, visite virtuelle ; ☐ <strong>[EXCLUSIF]</strong> plan de commercialisation renforcé : ……………………………………… ;</p>
<p style="text-align:justify;">– organiser les visites, faire signer à chaque visiteur un <strong>bon de visite</strong> et vérifier l'identité et la capacité de financement des candidats ;</p>
<p style="text-align:justify;">– transmettre au Mandant toute offre écrite, sans délai ;</p>
<p style="text-align:justify;">– rendre compte de son action ☐ chaque semaine ☐ toutes les deux semaines ;</p>
<p style="text-align:justify;">– préparer le dossier destiné au notaire ou aux adouls et accompagner les parties jusqu'à l'acte définitif.</p>
<p style="text-align:justify;">Le Mandataire <strong>n'est pas autorisé</strong> à recevoir des fonds au titre du prix, ni à signer la promesse ou la vente au nom du Mandant. Tout acompte est versé entre les mains du notaire.</p>
<h3><strong>ARTICLE 6 — OBLIGATIONS DU MANDANT</strong></h3>
<p style="text-align:justify;">Le Mandant déclare avoir la pleine capacité et le droit de disposer du bien. Il s'oblige à : remettre un <strong>certificat de propriété</strong> récent, le plan, ☐ le règlement de copropriété et l'attestation du syndic, ☐ le bail en cours ; signaler toute charge, servitude, litige ou vice connu ; permettre les visites aux heures convenues ; ne pas refuser, sans motif légitime, une offre conforme au prix et aux conditions du présent mandat.</p>
<h3><strong>ARTICLE 7 — RÉMUNÉRATION</strong></h3>
<p style="text-align:justify;">En cas de vente conclue avec un acquéreur présenté par le Mandataire, celui-ci perçoit une rémunération de <strong>{{commission_rate_nombre}} % TTC</strong> du prix de vente, soit {{commission_amount_nombre}} MAD pour le prix affiché, à la charge de ☐ du Mandant ☐ de l'acquéreur ☐ des deux, à raison de ……… % chacun.</p>
<p style="text-align:justify;">La rémunération est <strong>exigible à la signature de l'acte de vente définitif</strong>. Elle est réglée par le notaire sur instruction irrévocable du débiteur. Aucune somme n'est due si la vente n'est pas conclue.</p>
<p style="text-align:justify;"><strong>Clause de suite</strong> : la rémunération reste due si, dans les ……… mois suivant l'expiration du mandat, le Mandant vend le bien, directement ou par un autre intermédiaire, à un acquéreur présenté par le Mandataire pendant le mandat (bon de visite ou offre à l'appui). Le Mandataire communique au Mandant, à la fin du mandat, la liste de ces acquéreurs.</p>
<h3><strong>ARTICLE 8 — [EXCLUSIF] CLAUSE PÉNALE</strong></h3>
<p style="text-align:justify;">En cas de violation de l'exclusivité (vente directe ou par un autre intermédiaire pendant la durée d'exclusivité), ou de refus injustifié d'une offre conforme, le Mandant versera au Mandataire une indemnité forfaitaire égale à ……… % du prix affiché (au plus le montant de la rémunération prévue). Conformément à l'article 264 du DOC, le tribunal peut réduire cette indemnité si elle est manifestement excessive.</p>
<h3><strong>ARTICLE 9 — DISPOSITIONS GÉNÉRALES</strong></h3>
<p style="text-align:justify;"><strong>LBC/FT</strong> : le Mandataire, assujetti à la loi n° 43-05 telle que modifiée et à ses textes d'application, identifie le Mandant et les acquéreurs, peut demander l'origine des fonds et doit refuser toute opération lorsque l'identité n'est pas vérifiable. <strong>Données personnelles</strong> : traitement aux seules fins du mandat (loi n° 09-08) ; le Mandant autorise la diffusion des photos et caractéristiques du bien, sans son adresse exacte ☐ oui ☐ non. <strong>Consommation</strong> : droit de rétractation de la loi n° 31-08 si le mandat est conclu hors établissement.</p>
<p style="text-align:justify;">Le mandat est établi ☐ en langue française uniquement ☐ en deux versions, française et arabe, signées ensemble ; dans ce cas, en cas de divergence, la version ☐ arabe ☐ française prévaut. Tout litige relève des tribunaux de ……………</p>
<p style="text-align:justify;">Fait à {{agency_city}}, le {{date}}, en deux exemplaires originaux, dont un remis au Mandant.</p>
<table><tbody><tr><td><strong>Le Mandant</strong><br><em>« Bon pour mandat de vente »</em><br>Signature légalisée</td><td><strong>Le Mandataire</strong><br><em>« Mandat accepté »</em><br>Signature légalisée</td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()
UNION ALL
SELECT NULL::int, 'mandate_sale', $nom$وكالة البيع — عادية أو حصرية$nom$, 'ar', $html$
<h1 style="text-align:center;"><strong>وكالة البيع — ☐ عادية ☐ حصرية</strong></h1>
<p style="text-align:center;"><em>وكالة وساطة — الفصول 879 وما يليها من ظهير الالتزامات والعقود — الفصل 264 من ظ.ل.ع (الشرط الجزائي) — القانون رقم 43.05 — القانون رقم 09.08</em></p>
<blockquote style="text-align:right;"><strong>طبيعة الوكالة.</strong> يتعلق الأمر بـ<strong>وكالة وساطة</strong>: تبحث الوكالة عن مشتر وتتفاوض، لكنها <strong>لا يجوز لها توقيع الوعد بالبيع ولا توقيع البيع</strong> باسم المالك. ومنذ القانون رقم 41.25، يجب تحرير الوعد بالبيع والوكالة المتعلقة به في محرر رسمي (المادة 4 من مدونة الحقوق العينية)؛ ولا تقوم هذه الوكالة العرفية المصادق على إمضاءاتها مقامها.<br>يؤشر على <strong>عادية</strong> أو <strong>حصرية</strong> في العنوان وفي المادة 3؛ ولا تطبق البنود الموسومة بـ [حصرية] إلا على الوكالة الحصرية.</blockquote>
<h3 style="text-align:right;"><strong>بين الموقعين أسفله</strong></h3>
<p style="text-align:right;"><strong>1. الموكل</strong> (المالك): السيد(ة) / الشركة {{nom_mandants}}، البطاقة الوطنية / السجل التجاري رقم ……………، الساكن(ة) / مقرها بـ ……………………………، الهاتف {{client_phone}}، البريد الإلكتروني {{client_email}}، الحالة المدنية والنظام المالي للزوجين: ……………، يشار إليه فيما يلي بـ «الموكل». وفي حالة تعدد المالكين (الشياع)، يوقع جميعهم هذه الوكالة.</p>
<p style="text-align:right;"><strong>2. الوكيل</strong> (الوكالة): شركة {{agency_name}}، سجل تجاري رقم {{agency_rc}} (……………)، التعريف الموحد {{agency_ice}}، التعريف الضريبي ……………، مقرها {{agency_address}}، مؤمنة عن المسؤولية المدنية المهنية لدى …………… (عقد رقم ……………)، يمثلها {{agent_name}}، يشار إليها فيما يلي بـ «الوكيل».</p>
<h3 style="text-align:right;"><strong>المادة 1 — العقار المعروض للبيع</strong></h3>
<p style="text-align:right;">النوع: ☐ شقة ☐ فيلا ☐ منزل ☐ أرض ☐ محل — العنوان {{property_address}}، المساحة {{property_surface_nombre}} م²، يتكون من: {{property_consistance}}</p>
<p style="text-align:right;">الرسم العقاري عدد ……………، المحافظة العقارية بـ …………… ☐ عقار غير محفظ (ملكية / رسم عدلي عدد ……………)</p>
<p style="text-align:right;">☐ ملكية مشتركة: الجزء رقم ………، وكيل الاتحاد ……………………</p>
<p style="text-align:right;">الوضعية الكرائية: ☐ خال ☐ مكرى (الوجيبة ……… درهم، عقد بتاريخ ……………)</p>
<p style="text-align:right;">التحملات المعروفة: ☐ لا شيء ☐ رهن لفائدة …………… ☐ أخرى: ……………</p>
<h3 style="text-align:right;"><strong>المادة 2 — ثمن البيع</strong></h3>
<p style="text-align:right;">يعرض العقار للبيع بثمن <strong>{{asking_price_nombre}} درهم</strong> (……………………… درهم)، ☐ شاملا لأجرة الوكيل ☐ تضاف إليه الأجرة على عاتق المشتري. ويجوز للموكل قبول كل عرض يساوي أو يفوق ……………… درهم. ويتم كل تعديل للثمن كتابة (ملحق، بريد إلكتروني أو رسالة مؤكدة).</p>
<h3 style="text-align:right;"><strong>المادة 3 — طبيعة الوكالة</strong></h3>
<p style="text-align:right;">☐ <strong>وكالة عادية</strong>: يحتفظ الموكل بحق البيع بنفسه أو بواسطة وكالات أخرى. ويلتزم بإخبار الوكيل فورا بالبيع المبرم، مع بيان هوية المشتري، تفاديا لأداء الأجرة مرتين.</p>
<p style="text-align:right;">☐ <strong>وكالة حصرية</strong>: خلال مدة الحصرية، يمتنع الموكل عن بيع العقار مباشرة أو بواسطة وسيط آخر، ويحيل على الوكيل كل طلب يتوصل به مباشرة قصد معالجته.</p>
<h3 style="text-align:right;"><strong>المادة 4 — المدة</strong></h3>
<p style="text-align:right;">تمنح الوكالة لمدة ……… شهر ابتداء من تاريخ توقيعها.</p>
<p style="text-align:right;">– <strong>[حصرية]</strong> خلال مدة أولى <strong>غير قابلة للإلغاء</strong> قدرها ……… شهر (عمليا 3 أشهر)، لا يجوز إنهاء الوكالة إلا لخطأ جسيم من الوكيل. وبعد انصرامها، تستمر لمدة ……… شهر، ويجوز لكل طرف إنهاؤها في أي وقت بإشعار مدته 15 يوما برسالة مضمونة.</p>
<p style="text-align:right;">– <strong>[عادية]</strong> يجوز لكل طرف إنهاؤها في أي وقت بإشعار مدته 15 يوما برسالة مضمونة.</p>
<p style="text-align:right;">تنتهي الوكالة بقوة القانون بتوقيع عقد البيع النهائي، أو في الحالات المنصوص عليها في الفصول 929 وما يليها من ظهير الالتزامات والعقود.</p>
<h3 style="text-align:right;"><strong>المادة 5 — مهمة الوكيل والتزاماته</strong></h3>
<p style="text-align:right;">يلتزم الوكيل بما يلي:</p>
<p style="text-align:right;">– تقييم العقار وإرشاد الموكل بشأن ثمن السوق؛</p>
<p style="text-align:right;">– نشر الإعلانات على كل الوسائط، مع صور، وعند الاقتضاء، زيارة افتراضية؛ ☐ <strong>[حصرية]</strong> خطة تسويق معززة: ………………………………………؛</p>
<p style="text-align:right;">– تنظيم المعاينات، وجعل كل زائر يوقع <strong>سند معاينة</strong>، والتحقق من هوية المرشحين وقدرتهم على التمويل؛</p>
<p style="text-align:right;">– إحالة كل عرض مكتوب على الموكل دون تأخير؛</p>
<p style="text-align:right;">– تقديم تقرير عن نشاطه ☐ كل أسبوع ☐ كل أسبوعين؛</p>
<p style="text-align:right;">– إعداد الملف الموجه إلى الموثق أو العدول ومواكبة الأطراف إلى حين العقد النهائي.</p>
<p style="text-align:right;"><strong>لا يجوز</strong> للوكيل تسلم أي أموال برسم الثمن، ولا توقيع الوعد أو البيع باسم الموكل. ويودع كل تسبيق بين يدي الموثق.</p>
<h3 style="text-align:right;"><strong>المادة 6 — التزامات الموكل</strong></h3>
<p style="text-align:right;">يصرح الموكل بأنه كامل الأهلية ويملك حق التصرف في العقار. ويلتزم بما يلي: تسليم <strong>شهادة ملكية</strong> حديثة، والتصميم، ☐ ونظام الملكية المشتركة وشهادة وكيل الاتحاد، ☐ وعقد الكراء الجاري؛ الإخبار بكل تحمل أو ارتفاق أو نزاع أو عيب معروف؛ السماح بالمعاينات في الأوقات المتفق عليها؛ عدم رفض عرض مطابق للثمن ولشروط هذه الوكالة دون سبب مشروع.</p>
<h3 style="text-align:right;"><strong>المادة 7 — الأجرة</strong></h3>
<p style="text-align:right;">في حالة إبرام البيع مع مشتر قدمه الوكيل، يتقاضى هذا الأخير أجرة قدرها <strong>{{commission_rate_nombre}} % شاملة للضرائب</strong> من ثمن البيع، أي {{commission_amount_nombre}} درهم بالنسبة للثمن المعروض، على عاتق ☐ الموكل ☐ المشتري ☐ الطرفين، بنسبة ……… % لكل منهما.</p>
<p style="text-align:right;">تستحق الأجرة <strong>عند توقيع عقد البيع النهائي</strong>، ويؤديها الموثق بناء على تعليمات لا رجعة فيها من المدين بها. ولا يستحق أي مبلغ إذا لم يتم البيع.</p>
<p style="text-align:right;"><strong>شرط التتبع</strong>: تبقى الأجرة مستحقة إذا باع الموكل العقار، داخل ……… شهر الموالية لانتهاء الوكالة، مباشرة أو بواسطة وسيط آخر، لمشتر قدمه الوكيل خلال مدة الوكالة (بناء على سند معاينة أو عرض). ويسلم الوكيل للموكل، عند انتهاء الوكالة، لائحة بهؤلاء المشترين.</p>
<h3 style="text-align:right;"><strong>المادة 8 — [حصرية] الشرط الجزائي</strong></h3>
<p style="text-align:right;">في حالة خرق الحصرية (البيع المباشر أو بواسطة وسيط آخر خلال مدة الحصرية)، أو الرفض غير المبرر لعرض مطابق، يؤدي الموكل للوكيل تعويضا جزافيا يساوي ……… % من الثمن المعروض (في حدود مبلغ الأجرة المتفق عليها). وطبقا للفصل 264 من ظهير الالتزامات والعقود، يجوز للمحكمة تخفيض هذا التعويض إذا كان مبالغا فيه بشكل واضح.</p>
<h3 style="text-align:right;"><strong>المادة 9 — مقتضيات عامة</strong></h3>
<p style="text-align:right;"><strong>مكافحة غسل الأموال</strong>: يقوم الوكيل، الخاضع للقانون رقم 43.05 كما تم تغييره ولنصوصه التطبيقية، بالتحقق من هوية الموكل والمشترين، ويجوز له طلب مصدر الأموال، ويجب عليه رفض كل عملية يتعذر فيها التحقق من الهوية. <strong>المعطيات الشخصية</strong>: تعالج لغرض الوكالة فقط (القانون رقم 09.08)؛ ويأذن الموكل بنشر صور العقار ومواصفاته دون عنوانه الدقيق ☐ نعم ☐ لا. <strong>حماية المستهلك</strong>: حق التراجع المنصوص عليه في القانون رقم 31.08 إذا أبرمت الوكالة خارج المحل التجاري.</p>
<p style="text-align:right;">حررت الوكالة ☐ باللغة العربية فقط ☐ في نسختين، عربية وفرنسية، توقعان معا؛ وفي هذه الحالة، عند الاختلاف، يعتد بالنص ☐ العربي ☐ الفرنسي. ويختص بالنظر في كل نزاع محاكم ……………</p>
<p style="text-align:right;">حرر بـ {{agency_city}}، بتاريخ {{date}}، في نظيرين أصليين، سلم أحدهما للموكل.</p>
<table><tbody><tr><td style="text-align:right;"><strong>الموكل</strong><br>«صالح لوكالة البيع»<br>توقيع مصادق عليه</td><td style="text-align:right;"><strong>الوكيل</strong><br>«قبلت الوكالة»<br>توقيع مصادق عليه</td></tr></tbody></table>
$html$, TRUE, NOW(), NOW()

ON CONFLICT (name) WHERE agency_id IS NULL DO UPDATE SET
    document_type = EXCLUDED.document_type,
    lang = EXCLUDED.lang,
    body_html = EXCLUDED.body_html,
    is_builtin = TRUE,
    updated_at = NOW();
