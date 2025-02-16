import os
import json
import argparse
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

def create_model(input_dim: int) -> tf.keras.Model:
    """Create the neural network model."""
    model = tf.keras.Sequential([
        tf.keras.layers.Dense(64, activation='relu', input_dim=input_dim),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(32, activation='relu'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(16, activation='relu'),
        tf.keras.layers.Dense(1, activation='sigmoid')
    ])
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(),
        loss='binary_crossentropy',
        metrics=['accuracy', tf.keras.metrics.AUC()]
    )
    
    return model

def train_model(args):
    """Train the model with the provided data."""
    # Load and preprocess data
    X = args.dataset
    y = args.labels
    
    # Split data
    X_train, X_val, y_train, y_val = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42
    )
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    
    # Create and train model
    model = create_model(X_train.shape[1])
    
    # Add callbacks
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=5,
            restore_best_weights=True
        ),
        tf.keras.callbacks.ModelCheckpoint(
            filepath=os.path.join(args.model_dir, 'best_model'),
            monitor='val_loss',
            save_best_only=True
        )
    ]
    
    # Train the model
    history = model.fit(
        X_train_scaled,
        y_train,
        epochs=args.epochs,
        batch_size=args.batch_size,
        validation_data=(X_val_scaled, y_val),
        callbacks=callbacks
    )
    
    # Save the scaler
    tf.saved_model.save(
        scaler,
        os.path.join(args.model_dir, 'scaler')
    )
    
    # Save training history
    with open(os.path.join(args.model_dir, 'history.json'), 'w') as f:
        json.dump(history.history, f)
    
    return model

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', type=str, required=True)
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--learning-rate', type=float, default=0.001)
    
    args = parser.parse_args()
    
    model = train_model(args)
    
    # Save the final model
    model.save(os.path.join(args.model_dir, 'model')) 