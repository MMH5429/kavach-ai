# Datasets

Datasets are not committed (see root `.gitignore`). To re-train M2:

```bash
git clone https://github.com/SanjayMarreddi/Fake-Currency-Checker ml/datasets/_raw_fake_currency_checker
```

Expected layout used by `ml/m2_train.py`:

```
ml/datasets/_raw_fake_currency_checker/Indian Currency Dataset/
  train/{fake,real}/        # 77 / 73 images
  validation/{fake,real}/   # 31 / 29 images
  test/{fake,real}/         # 59 / 48 images
```

M3 (`ml/m3_graph_train.py`) needs no download — it generates its simulated
PaySim-schema ledger deterministically (seeded) at run time.
