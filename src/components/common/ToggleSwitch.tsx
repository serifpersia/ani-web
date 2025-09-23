
import React from 'react';
import styles from './ToggleSwitch.module.css';

interface ToggleSwitchProps {
  isChecked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ isChecked, onChange, id }) => {
  return (
    <label className={styles.switch} htmlFor={id}>
      <input type="checkbox" id={id} checked={isChecked} onChange={onChange} />
      <span className={styles.slider}></span>
    </label>
  );
};

export default ToggleSwitch;
