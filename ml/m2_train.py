"""M2 — Train the counterfeit currency detector.

Transfer-learns MobileNetV3-Small (ImageNet weights) on the public
"Fake Currency Checker" dataset (real/fake Indian notes), evaluates on the
held-out test split, and exports:

  backend/app/resources/counterfeit_mnv3.onnx   — CPU inference model
  backend/app/resources/counterfeit_meta.json   — preprocessing + provenance + REAL metrics

Run:  ml/.venv/Scripts/python.exe ml/m2_train.py   (CPU-friendly, ~5-10 min)
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "datasets" / "_raw_fake_currency_checker" / "Indian Currency Dataset"
OUT_DIR = ROOT.parent / "backend" / "app" / "resources"
OUT_DIR.mkdir(parents=True, exist_ok=True)

INPUT_SIZE = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
EPOCHS = 8
BATCH = 16
SEED = 42


def loaders():
    train_tf = transforms.Compose([
        transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.RandomRotation(8),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    train_ds = datasets.ImageFolder(DATA_DIR / "train", train_tf)
    val_ds = datasets.ImageFolder(DATA_DIR / "validation", eval_tf)
    test_ds = datasets.ImageFolder(DATA_DIR / "test", eval_tf)
    assert train_ds.classes == ["fake", "real"], train_ds.classes
    return (
        DataLoader(train_ds, batch_size=BATCH, shuffle=True, num_workers=0),
        DataLoader(val_ds, batch_size=BATCH, num_workers=0),
        DataLoader(test_ds, batch_size=BATCH, num_workers=0),
        train_ds.classes,
    )


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    correct = total = 0
    tp = fp = fn = tn = 0  # positive class = "fake" (index 0)
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        pred = model(x).argmax(1)
        correct += (pred == y).sum().item()
        total += y.numel()
        tp += ((pred == 0) & (y == 0)).sum().item()
        fp += ((pred == 0) & (y == 1)).sum().item()
        fn += ((pred == 1) & (y == 0)).sum().item()
        tn += ((pred == 1) & (y == 1)).sum().item()
    acc = correct / total
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return acc, precision, recall, f1, {"tp": tp, "fp": fp, "fn": fn, "tn": tn}


def main():
    torch.manual_seed(SEED)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    train_loader, val_loader, test_loader, classes = loaders()
    print(f"device={device} classes={classes} "
          f"train={len(train_loader.dataset)} val={len(val_loader.dataset)} test={len(test_loader.dataset)}")

    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    # Freeze the backbone; train only the classifier head (fast, small-data-friendly).
    for p in model.features.parameters():
        p.requires_grad = False
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, 2)
    model = model.to(device)

    opt = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=1e-3, weight_decay=1e-4
    )
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=EPOCHS)
    loss_fn = nn.CrossEntropyLoss()

    best_val, best_state = 0.0, None
    for epoch in range(EPOCHS):
        model.train()
        running = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            running += loss.item() * y.numel()
        sched.step()
        val_acc, *_ = evaluate(model, val_loader, device)
        print(f"epoch {epoch+1}/{EPOCHS} loss={running/len(train_loader.dataset):.4f} val_acc={val_acc:.3f}")
        if val_acc >= best_val:
            best_val = val_acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    model.load_state_dict(best_state)
    test_acc, prec, rec, f1, cm = evaluate(model, test_loader, device)
    print(f"TEST: acc={test_acc:.3f} precision(fake)={prec:.3f} recall(fake)={rec:.3f} f1={f1:.3f} cm={cm}")

    # Export ONNX
    model.eval().cpu()
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)
    onnx_path = OUT_DIR / "counterfeit_mnv3.onnx"
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["input"], output_names=["logits"],
        dynamo=False,
    )

    meta = {
        "model_name": "MobileNetV3-Small (ImageNet backbone, head fine-tuned)",
        "classes": classes,
        "input_size": INPUT_SIZE,
        "normalize_mean": MEAN,
        "normalize_std": STD,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "Fake Currency Checker — public Indian real/fake note dataset "
                   f"({len(train_loader.dataset)} train / {len(val_loader.dataset)} val / {len(test_loader.dataset)} test images)",
        "epochs": EPOCHS,
        "seed": SEED,
        "metrics": {
            "val_accuracy_best": round(best_val, 4),
            "test_accuracy": round(test_acc, 4),
            "test_precision_fake": round(prec, 4),
            "test_recall_fake": round(rec, 4),
            "test_f1_fake": round(f1, 4),
            "confusion_matrix": cm,
        },
    }
    (OUT_DIR / "counterfeit_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"saved {onnx_path} ({onnx_path.stat().st_size/1e6:.1f} MB) + counterfeit_meta.json")


if __name__ == "__main__":
    main()
