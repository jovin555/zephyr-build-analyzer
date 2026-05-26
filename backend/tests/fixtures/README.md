# Test Fixtures

Place real Zephyr build artifacts here for parser unit tests:

- `zephyr.elf` — compiled ELF binary (any Zephyr sample, e.g. `hello_world` for `nrf52840dk_nrf52840`)
- `zephyr.map` — linker map file from the same build
- `.config` — Kconfig output from the same build

To generate:
```bash
west build -b nrf52840dk_nrf52840 samples/hello_world
cp build/zephyr/zephyr.elf tests/fixtures/
cp build/zephyr/zephyr.map tests/fixtures/
cp build/zephyr/.config tests/fixtures/
```
