# Atlas Lunar (pkg-r)

O Atlas Lunar reúne registros canónicos em JSON para consulta determinística no núcleo da Luna.

## Estrutura

- `manifest.json`: metadados do pacote e IDs esperados.
- `schema/registro.schema.json`: contrato JSON Schema de cada registro.
- `registros/*.json`: sementes versionadas (1 arquivo por registro).
- `atlas.compiled.json`: saída compilada gerada por `compilarAtlas`.

## Fluxo

1. `validate`: valida `manifest` + registros.
2. `compile`: valida e escreve `atlas.compiled.json`.
3. `list`: lista IDs e títulos disponíveis para consulta.
