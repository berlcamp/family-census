// /lib/redux/listSlice.ts
import { Voter } from '@/types'
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface ListState {
  voters: Voter[]
  votersPage: number
}

const initialState: ListState = {
  voters: [],
  votersPage: 1
}

const listSlice = createSlice({
  name: 'list',
  initialState,
  reducers: {
    // Voters
    setVoters: (state, action: PayloadAction<Voter[]>) => {
      state.voters = action.payload
    },
    appendVoters: (state, action: PayloadAction<Voter[]>) => {
      state.voters = [...state.voters, ...action.payload]
      state.votersPage += 1
    },
    updateVoter: (state, action: PayloadAction<Voter>) => {
      const updated = action.payload
      const index = state.voters.findIndex((h) => h.id === updated.id)
      if (index !== -1) {
        state.voters[index] = updated
      }
    },
    resetVoters: (state) => {
      state.voters = []
      state.votersPage = 1
    },
    setVotersPage: (state, action) => {
      state.votersPage = action.payload
    }
  }
})

export const {
  setVoters,
  appendVoters,
  updateVoter,
  resetVoters,
  setVotersPage
} = listSlice.actions

export default listSlice.reducer
