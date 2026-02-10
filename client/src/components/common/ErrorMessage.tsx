import React from 'react'
import styles from './ErrorMessage.module.css'
import { FaExclamationTriangle } from 'react-icons/fa'

interface ErrorMessageProps {
  message: string
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  return (
    <div className={styles.errorBox}>
      <FaExclamationTriangle className={styles.icon} />
      <span>{message}</span>
    </div>
  )
}

export default ErrorMessage
