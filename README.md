# Netherstone templates

Vaults to start from in [Netherstone](https://netherstone.app). Each one is listed on [netherstone.app/templates](https://netherstone.app/templates), where Open in Netherstone adds it as a new vault.

## Adding a template

1. Make a folder at the top of this repository. Its name is the template's id and shows in links, so pick lowercase words with dashes and don't rename it later.
2. Put the vault in it: shards (`.md`), drawings (`.excalidraw`) and pictures in one `_attachments` folder. Link shards to each other with @ links, which are saved as relative Markdown links. To show a drawing in a shard, use Add to shard in Netherstone, which saves its pictures in `_attachments`.
3. Add `template.json` next to the vault files:

   ```json
   {
     "name": "Worldbuilding",
     "line": "A world for a story or a game",
     "firstShard": "Start here.md",
     "minAppVersion": "0.7.0-beta.1",
     "order": 1
   }
   ```

   `firstShard` opens once the vault is made, so it has to be a shard in the folder. `minAppVersion` is the oldest Netherstone the template works in. `order` places it on the templates page and can't repeat another template's.
4. Open a pull request. A check makes sure `template.json` is valid, there are only vault files with names Windows can hold, every link and picture resolves, and every picture is used. Run it yourself with `node .github/scripts/check-templates.mjs`.

Once merged, the site rebuilds and the template is live.
