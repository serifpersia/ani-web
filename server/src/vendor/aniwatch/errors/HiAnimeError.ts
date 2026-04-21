/**
 * HiAnime error handler
 */

interface AniwatchError extends Error {
  scraper: string
  status: number
}

export class HiAnimeError extends Error implements AniwatchError {
  static DEFAULT_ERROR_STATUS = 500
  static DEFAULT_ERROR_MESSAGE = 'Something went wrong'

  public scraper: string = HiAnimeError.DEFAULT_ERROR_MESSAGE
  public status: number = HiAnimeError.DEFAULT_ERROR_STATUS

  constructor(errMsg: string, scraperName: string, status?: number) {
    super(`${scraperName}: ${errMsg}`)
    this.name = HiAnimeError.name
    this.scraper = scraperName

    if (status) {
      this.status = status >= 400 && status < 600 ? status : HiAnimeError.DEFAULT_ERROR_STATUS
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HiAnimeError)
    }
  }

  static wrapError(err: HiAnimeError | any, scraperName: string): HiAnimeError {
    if (err instanceof HiAnimeError) {
      return err
    }

    // Check if it's an axios error
    if (err?.response?.statusText !== undefined) {
      const statusText = err?.response?.statusText || HiAnimeError.DEFAULT_ERROR_MESSAGE
      return new HiAnimeError(
        'fetchError: ' + statusText,
        scraperName,
        err.status || HiAnimeError.DEFAULT_ERROR_STATUS
      )
    }

    return new HiAnimeError(err?.message || HiAnimeError.DEFAULT_ERROR_MESSAGE, scraperName)
  }

  json() {
    return {
      status: this.status,
      message: this.message,
    }
  }
}
