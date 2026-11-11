# GitHub Bench

Catalogue editorial de projets open source sur GitHub : IA, Claude Code, skills, outils et MCP; Home Assistant; projets open source en tendance; et une selection French tech. La presse tech generaliste est hors perimetre.

## Utiliser le catalogue

Le site statique est dans `site/`. Les fiches publiees se trouvent dans `site/data/catalog.json`. Le catalogue contient quelques fiches editoriales d'amorcage avec leurs apercus; une decouverte automatique reste une suggestion et n'ajoute jamais de fiche publiee.

Une fiche publiee contient un identifiant stable, le depot GitHub, une description editoriale, les cas d'usage, les tags, la date de revue et un score detaille. Les quatre criteres sont notes de 0 a 5 :

- **Pertinence** : correspondance avec le theme de la categorie.
- **Utilisabilite** : facilite d'installation et d'integration, d'apres les informations du depot.
- **Documentation** : qualite des instructions et exemples disponibles.
- **Maintenance** : activite recente et signaux de maintenance visibles.

Le score affiche est la moyenne des quatre criteres. Les etoiles et autres metriques GitHub sont affichees separement et ne sont pas un score de qualite. Reevaluer les scores a chaque revue; ils restent des jugements editoriaux, pas une mesure objective.

Pour ajouter une fiche, editer `site/data/catalog.json` et renseigner les champs utilises par les exemples du site. `category` vaut `ai`, `home-assistant` ou `trending`; `frenchTech: true` ajoute le projet a la section French tech sans remplacer sa categorie; `status` vaut `published` ou `archived`. Une fiche archivee n'apparait que lorsque le filtre d'archives est active. Pour retirer completement une fiche, supprimer son objet du JSON. L'historique Git garde la trace des modifications.

Exemple de fiche minimale (les quatre notes sont obligatoires et doivent etre justifiees par une revue du depot) :

```json
{
  "id": "owner-repository",
  "name": "Repository",
  "fullName": "owner/repository",
  "url": "https://github.com/owner/repository",
  "category": "ai",
  "summary": "Description editoriale courte, sans recopier la page du depot.",
  "tags": ["mcp", "self-hosted"],
  "useCases": ["Automatiser une tache locale"],
  "publishedAt": "2026-11-11",
  "reviewedAt": "2026-11-11",
  "status": "published",
  "score": {
    "fit": 4,
    "usability": 3,
    "documentation": 4,
    "maintenance": 4
  },
  "starsAtReview": 0,
  "lastPushedAt": "2026-11-10"
}
```

Les apercus sont visibles directement en haut des fiches de la liste. Une image doit provenir du depot repertorie, avec texte alternatif, lien vers le fichier source et attribution. Le site charge le fichier depuis `raw.githubusercontent.com` sans le recopier; il faut donc garder une source publique du meme depot. Ne pas utiliser d'avatar comme capture. Si l'image est indisponible, un visuel neutre la remplace.

Le format est `image: {"path": "https://raw.githubusercontent.com/owner/repository/main/docs/capture.png", "alt": "Description", "sourceUrl": "https://github.com/owner/repository/blob/main/docs/capture.png", "attribution": "Capture du depot owner/repository"}`. Omettre entierement `image` lorsqu'aucun visuel du depot n'est disponible.

## Comparateur LLM et outils

La section **Bench des LLM cloud** compare uniquement des modeles servis via des API cloud par OpenRouter; elle n'inclut pas les runtimes locaux comme Ollama et le site n'execute aucun modele sur votre machine. Elle affiche un instantane du meilleur modele de chaque fournisseur selon son Intelligence Index publie; les indices Code et Agent sont ceux de ce meme modele, pas le meilleur modele de chaque fournisseur pour ces taches. Les mesures proviennent d'Artificial Analysis via les metadonnees publiques OpenRouter; le site ne lance pas ses propres tests et n'invente aucune valeur. Les absences sont affichees `N/D`. Le prix par million de tokens et la fenetre de contexte sont des metadonnees OpenRouter datees, susceptibles de varier selon le fournisseur. La capacite `tool calling` indique seulement que l'API annonce ce parametre, pas un succes mesure.

Les outils associes sont des depots GitHub selectionnes et classes par usage (agents de code, API cloud, MCP), pas un classement de qualite. La section **Outils qui montent** montre aussi des depots recents tries par etoiles/jour depuis leur creation. C'est un signal de traction calcule a partir du nombre actuel d'etoiles, pas un historique de croissance ni un indicateur de qualite. Les suggestions brutes sont relues avant d'etre ajoutees a `site/data/growing-tools.json`; aucune recherche ne publie de candidat sans revue.

Pour rafraichir l'instantane de modeles depuis la racine du depot :

```powershell
python scripts\update_benchmarks.py
```

Cette commande accede a l'API publique OpenRouter, ne necessite pas de cle, et met a jour `site/data/llm-benchmarks.json`. Elle ne lance pas de prompt et ne transmet aucune donnee privee.

## Rechercher des candidats

Pour lancer une recherche **tout de suite en local**, ouvrir PowerShell a la racine du depot et executer, par exemple :

```powershell
python scripts\discover.py --category ai --topic "Claude Code skills et MCP" --limit 20 --output candidates\claude-code.json
```

Remplacer `--category` par `ai`, `home-assistant`, `trending`, `tools-growth`, `french-tech` ou `all`; `--topic` peut aussi etre une URL de depot GitHub. La categorie `tools-growth` cherche les depots recents dans les themes d'agents, skills et MCP, puis trie les suggestions par etoiles/jour depuis leur creation (fenetre de 90 jours). `french-tech` utilise les topics GitHub `france` et `french`, qui ne suffisent pas a eux seuls a confirmer l'origine d'un projet. Sans sujet, la commande utilise les requetes predefinies de la categorie. Python 3.10+ et un acces Internet sont necessaires. Aucune cle n'est requise pour un essai; l'API publique applique ses limites anonymes. Le JSON apparait dans `candidates/`, dossier local ignore par Git. Ces candidats doivent etre relus avant publication.

Exemples pour une recherche immediate :

```powershell
python scripts\discover.py --category tools-growth --limit 20 --output candidates\tools-growth.json
python scripts\discover.py --category french-tech --limit 20 --output candidates\french-tech.json
```

Apres fusion dans la branche par defaut, lancer une recherche ponctuelle dans **Actions > Discover repositories > Run workflow**, puis telecharger l'artefact de la run terminee. Le workflow accepte la categorie, un sujet facultatif et le nombre maximal de resultats.

Le workflow effectue aussi une recherche chaque lundi a 09:17 UTC dans les categories IA, Home Assistant, open source tendance, outils en croissance et French tech. Il sauvegarde les resultats en artefacts de revue pendant 30 jours; il ne modifie ni le catalogue ni le depot. Il utilise le `GITHUB_TOKEN` fourni automatiquement par GitHub Actions et ne requiert aucun secret personnalise. Il ne dispose que de la permission de lecture du contenu. L'API Search de GitHub est soumise a des quotas et son classement n'est pas une mesure complete de tendance ou de qualite. Les candidats peuvent etre mal classes, incomplets ou non pertinents.

La planification hebdomadaire et la recherche manuelle ne deviennent disponibles qu'apres fusion de ces workflows dans la branche par defaut.

## Demander une recherche ou gerer une fiche

- Utiliser **Issues > Request deeper research** pour documenter un sujet a explorer; on peut aussi fournir le sujet dans le workflow manuel.
- Utiliser **Issues > Archive or remove a catalog entry** pour demander l'archivage ou le retrait d'une fiche.

Ces demandes sont des tickets de travail, pas des commandes automatiques. Un mainteneur recherche et valide les informations, puis met a jour `site/data/catalog.json` manuellement par une modification revue. Aucun workflow ne supprime, archive ou publie une fiche sans revue humaine.

## Publication GitHub Pages

Le workflow **Publish catalog to Pages** deploye le site apres chaque push sur `main` et peut aussi etre lance manuellement. Pour activer la publication, le proprietaire doit :

1. Verifier que GitHub Actions est autorise pour le depot et l'organisation.
2. Dans **Settings > Pages**, choisir **GitHub Actions** comme source de build/deploiement.
3. Fusionner les workflows dans `main`; le premier push deploye le site.

Le workflow de deploiement demande `pages: write` et `id-token: write` et utilise l'environnement GitHub Pages. Aucun secret additionnel ni service externe n'est requis. Les reglages Pages et Actions de l'organisation peuvent necessiter une intervention d'un administrateur.

## Structure

- `site/` : site statique sans dependances ou compilation.
- `site/data/catalog.json` : contenu editorial publie.
- `site/data/llm-benchmarks.json` : instantane de mesures comparatives et source/date.
- `site/data/llm-tools.json` : selection de depots d'outils pour modeles cloud.
- `site/data/growing-tools.json` : instantane de signaux de traction pour des outils recents.
- `scripts/discover.py` : recherche de candidats via l'API GitHub.
- `scripts/update_benchmarks.py` : mise a jour manuelle des metadonnees de benchmark OpenRouter.
- `tests/` : tests unitaires du format de recherche et de normalisation.
- `.github/ISSUE_TEMPLATE/` : formulaires de recherche approfondie et de maintenance.
- `.github/workflows/` : recherche manuelle et hebdomadaire, publication Pages sur push.

## Limites du MVP

La recherche utilise l'API de depots GitHub, pas un moteur de tendances temps reel. Les filtres par topics dependent du bon etiquetage des depots, et les sujets libres suivent la syntaxe de recherche GitHub. Les captures n'ont pas de generation automatique; elles sont ajoutees editorialement. La publication Pages exige les reglages ci-dessus ainsi que les politiques Actions de l'organisation.
